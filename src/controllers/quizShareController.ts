import type { Context } from "hono";
import { prisma } from "../lib/prisma";
import { createNotification } from "../services/notificationService";

/**
 * Update user's default privacy setting
 * This affects ALL of the user's content (quizzes, documents, etc.)
 * Sets to PRIVATE, FRIENDS, or PUBLIC
 */
export const updateQuizVisibility = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;
    const { visibility } = await c.req.json();

    if (!visibility) {
      return c.json({ success: false, error: "Missing visibility" }, 400);
    }

    const validVisibility = ["PRIVATE", "FRIENDS", "PUBLIC"];
    if (!validVisibility.includes(visibility)) {
      return c.json({ success: false, error: "Invalid visibility value. Must be PRIVATE, FRIENDS, or PUBLIC" }, 400);
    }

    // Update the user's default privacy setting
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { defaultPrivacy: visibility },
    });

    // If changing away from PRIVATE, optionally clear all specific shares for this user's quizzes
    if (visibility !== "PRIVATE") {
      const userQuizzes = await prisma.customQuiz.findMany({
        where: { userId },
        select: { id: true },
      });

      const quizIds = userQuizzes.map(q => q.id);

      if (quizIds.length > 0) {
        await prisma.customQuizShare.deleteMany({
          where: { customQuizId: { in: quizIds } },
        });
      }
    }

    return c.json({ success: true, data: { defaultPrivacy: updatedUser.defaultPrivacy } });
  } catch (error) {
    console.error("Error updating user privacy:", error);
    return c.json({ success: false, error: "Failed to update privacy setting" }, 500);
  }
};

/**
 * Request access to a quiz (friend requests, owner approves by sharing)
 * Sends a notification to the quiz owner
 */
export const requestQuizAccess = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;
    const { customQuizId } = await c.req.json();

    if (!customQuizId) {
      return c.json({ success: false, error: "Missing customQuizId" }, 400);
    }

    const quiz = await prisma.customQuiz.findUnique({
      where: { id: customQuizId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!quiz) {
      return c.json({ success: false, error: "Quiz not found" }, 404);
    }

    if (quiz.userId === userId) {
      return c.json({ success: false, error: "You already own this quiz" }, 400);
    }

    // Check if they're friends (mutual follow)
    const yourFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: userId,
          followingId: quiz.userId,
        },
      },
    });

    const theirFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: quiz.userId,
          followingId: userId,
        },
      },
    });

    const areFriends =
      yourFollow?.status === "FOLLOWING" &&
      theirFollow?.status === "FOLLOWING";

    if (!areFriends) {
      return c.json({ success: false, error: "You can only request quizzes from friends" }, 403);
    }

    // Check if already shared
    const existingShare = await prisma.customQuizShare.findUnique({
      where: {
        customQuizId_sharedWithUserId: {
          customQuizId,
          sharedWithUserId: userId,
        },
      },
    });

    if (existingShare) {
      return c.json({ success: false, error: "You already have access to this quiz" }, 400);
    }

    // Create notification for the quiz owner
    try {
      const requesterName = user.firstName || user.username || "Someone";
      console.log(`📬 Creating QUIZ_SHARED notification for owner ${quiz.userId} from ${userId} (${requesterName})`);

      const notification = await createNotification({
        userId: quiz.userId, // Notify the quiz owner
        type: "QUIZ_SHARED",
        title: "Lesson Access Requested",
        message: `${requesterName} requested access to "${quiz.name}"`,
        actionUrl: `/profile/friends/${userId}`, // Navigate to requester's friend profile to approve/deny
      });

      console.log(`✅ Successfully created notification:`, notification.id);
    } catch (notifError) {
      console.error("❌ Failed to create quiz access request notification:", notifError);
      throw notifError; // Fail the request if notification fails
    }

    return c.json({
      success: true,
      message: "Access request sent to quiz owner"
    });
  } catch (error) {
    console.error("Error requesting quiz access:", error);
    return c.json({ success: false, error: "Failed to request quiz access" }, 500);
  }
};

/**
 * Get pending quiz access requests for the current user's quizzes from a specific requester
 * Returns quizzes that the requester has asked for but doesn't have access to yet
 */
export const getPendingRequestsFromUser = async (c: Context) => {
  try {
    const currentUser = c.get("user");
    const currentUserId = currentUser.id;
    const requesterId = c.req.param("requesterId");

    if (!requesterId) {
      return c.json({ success: false, error: "Missing requesterId" }, 400);
    }

    // Get all quizzes owned by current user
    const myQuizzes = await prisma.customQuiz.findMany({
      where: { userId: currentUserId },
      select: { id: true, name: true },
    });

    const myQuizIds = myQuizzes.map(q => q.id);

    // Get quizzes that requester already has access to
    const existingShares = await prisma.customQuizShare.findMany({
      where: {
        customQuizId: { in: myQuizIds },
        sharedWithUserId: requesterId,
      },
      select: { customQuizId: true },
    });

    const sharedQuizIds = new Set(existingShares.map(s => s.customQuizId));

    // Get recent notifications about access requests from this user
    const recentRequests = await prisma.notification.findMany({
      where: {
        userId: currentUserId,
        type: "QUIZ_SHARED",
        message: {
          contains: "requested access",
        },
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Extract quiz names from notification messages and find pending ones
    const pendingRequests: Array<{ quizId: string; quizName: string; requestedAt: string }> = [];
    const seenQuizIds = new Set<string>();

    for (const notification of recentRequests) {
      // Parse quiz name from message like "John requested access to \"Quiz Name\""
      const match = notification.message.match(/requested access to "(.+)"/);
      if (match) {
        const quizName = match[1];
        const quiz = myQuizzes.find(q => q.name === quizName);

        if (quiz && !sharedQuizIds.has(quiz.id) && !seenQuizIds.has(quiz.id)) {
          pendingRequests.push({
            quizId: quiz.id,
            quizName: quiz.name,
            requestedAt: notification.createdAt.toISOString(),
          });
          seenQuizIds.add(quiz.id);
        }
      }
    }

    return c.json({
      success: true,
      data: pendingRequests,
    });
  } catch (error) {
    console.error("Error getting pending requests:", error);
    return c.json({ success: false, error: "Failed to get pending requests" }, 500);
  }
};

/**
 * Get quiz IDs that the current user has requested access to from a specific owner
 * Returns array of quiz IDs where the user has sent a request but doesn't have access yet
 */
export const getMyRequestsToUser = async (c: Context) => {
  try {
    const currentUser = c.get("user");
    const currentUserId = currentUser.id;
    const ownerId = c.req.param("ownerId");

    if (!ownerId) {
      return c.json({ success: false, error: "Missing ownerId" }, 400);
    }

    // Get recent notifications that the owner received about requests from current user
    const recentRequests = await prisma.notification.findMany({
      where: {
        userId: ownerId,
        type: "QUIZ_SHARED",
        message: {
          contains: "requested access",
        },
        actionUrl: {
          contains: currentUserId, // Action URL contains the requester's ID
        },
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Get owner's quizzes to match names
    const ownerQuizzes = await prisma.customQuiz.findMany({
      where: { userId: ownerId },
      select: { id: true, name: true },
    });

    // Get quizzes current user already has access to
    const existingShares = await prisma.customQuizShare.findMany({
      where: {
        customQuizId: { in: ownerQuizzes.map(q => q.id) },
        sharedWithUserId: currentUserId,
      },
      select: { customQuizId: true },
    });

    const sharedQuizIds = new Set(existingShares.map(s => s.customQuizId));

    // Extract requested quiz IDs
    const requestedQuizIds = new Set<string>();

    for (const notification of recentRequests) {
      const match = notification.message.match(/requested access to "(.+)"/);
      if (match) {
        const quizName = match[1];
        const quiz = ownerQuizzes.find(q => q.name === quizName);

        if (quiz && !sharedQuizIds.has(quiz.id)) {
          requestedQuizIds.add(quiz.id);
        }
      }
    }

    return c.json({
      success: true,
      data: Array.from(requestedQuizIds),
    });
  } catch (error) {
    console.error("Error getting user's sent requests:", error);
    return c.json({ success: false, error: "Failed to get sent requests" }, 500);
  }
};

/**
 * Deny a quiz access request
 * Marks the related notifications as read to dismiss the request
 */
export const denyQuizAccess = async (c: Context) => {
  try {
    const currentUser = c.get("user");
    const currentUserId = currentUser.id;
    const { customQuizId, requesterId } = await c.req.json();

    if (!customQuizId || !requesterId) {
      return c.json({ success: false, error: "Missing customQuizId or requesterId" }, 400);
    }

    // Verify the quiz belongs to the current user
    const quiz = await prisma.customQuiz.findUnique({
      where: { id: customQuizId },
    });

    if (!quiz) {
      return c.json({ success: false, error: "Quiz not found" }, 404);
    }

    if (quiz.userId !== currentUserId) {
      return c.json({ success: false, error: "You can only deny requests for your own quizzes" }, 403);
    }

    // Find and mark as read all notifications about this specific quiz request from this requester
    await prisma.notification.updateMany({
      where: {
        userId: currentUserId,
        type: "QUIZ_SHARED",
        message: {
          contains: `requested access to "${quiz.name}"`,
        },
        actionUrl: {
          contains: requesterId,
        },
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });

    return c.json({
      success: true,
      message: "Access request denied",
    });
  } catch (error) {
    console.error("Error denying quiz access:", error);
    return c.json({ success: false, error: "Failed to deny quiz access" }, 500);
  }
};

/**
 * Share quiz with specific friend (SPECIFIC visibility mode)
 * Automatically sets quiz visibility to SPECIFIC if not already set
 */
export const shareQuizWithFriend = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;
    const { customQuizId, friendUserId } = await c.req.json();

    if (!customQuizId || !friendUserId) {
      return c.json({ success: false, error: "Missing customQuizId or friendUserId" }, 400);
    }

    const quiz = await prisma.customQuiz.findUnique({
      where: { id: customQuizId },
    });

    if (!quiz) {
      return c.json({ success: false, error: "Quiz not found" }, 404);
    }

    if (quiz.userId !== userId) {
      return c.json({ success: false, error: "You can only share your own quizzes" }, 403);
    }

    // No need to change visibility - PRIVATE quizzes use CustomQuizShare for access control
    // FRIENDS/PUBLIC quizzes can also have specific shares for additional access

    // Check if they're friends (mutual follow)
    const yourFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: userId,
          followingId: friendUserId,
        },
      },
    });

    const theirFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: friendUserId,
          followingId: userId,
        },
      },
    });

    const areFriends =
      yourFollow?.status === "FOLLOWING" &&
      theirFollow?.status === "FOLLOWING";

    if (!areFriends) {
      return c.json({ success: false, error: "You can only share quizzes with friends" }, 403);
    }

    const existingShare = await prisma.customQuizShare.findUnique({
      where: {
        customQuizId_sharedWithUserId: {
          customQuizId,
          sharedWithUserId: friendUserId,
        },
      },
    });

    if (existingShare) {
      return c.json({ success: false, error: "Quiz already shared with this user" }, 400);
    }

    const share = await prisma.customQuizShare.create({
      data: {
        customQuizId,
        sharedWithUserId: friendUserId,
      },
      include: {
        sharedWith: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Create notification for the friend
    try {
      const sharerName = user.firstName || user.username || "Someone";
      console.log(`📬 Attempting to create QUIZ_SHARED notification for user ${friendUserId} from ${userId} (${sharerName})`);
      
      const notification = await createNotification({
        userId: friendUserId, // Notify the friend receiving the share
        type: "QUIZ_SHARED" as any, // Will work at runtime after Prisma regeneration
        title: "Lesson Shared",
        message: `${sharerName} shared a lesson with you`,
        actionUrl: "/learning/shared",
      });
      
      console.log(`✅ Successfully created notification:`, notification.id);
    } catch (notifError) {
      console.error("❌ Failed to create quiz share notification:", notifError);
      console.error("Error details:", notifError instanceof Error ? notifError.message : String(notifError));
      // Don't fail the whole process if notification fails
    }

    return c.json({ success: true, data: share });
  } catch (error) {
    console.error("Error sharing quiz:", error);
    return c.json({ success: false, error: "Failed to share quiz" }, 500);
  }
};

/**
 * Unshare quiz from specific friend
 */
export const unshareQuiz = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;
    const shareId = c.req.param("id");

    const share = await prisma.customQuizShare.findUnique({
      where: { id: shareId },
      include: {
        customQuiz: true,
      },
    });

    if (!share) {
      return c.json({ success: false, error: "Share not found" }, 404);
    }

    if (share.customQuiz.userId !== userId) {
      return c.json({ success: false, error: "Unauthorized" }, 403);
    }

    await prisma.customQuizShare.delete({
      where: { id: shareId },
    });

    return c.json({ success: true, message: "Quiz unshared successfully" });
  } catch (error) {
    console.error("Error unsharing quiz:", error);
    return c.json({ success: false, error: "Failed to unshare quiz" }, 500);
  }
};

/**
 * Get all specific shares for a quiz
 * Returns the quiz owner's privacy setting and explicit shares
 */
export const getQuizShares = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;
    const customQuizId = c.req.param("quizId");

    const quiz = await prisma.customQuiz.findUnique({
      where: { id: customQuizId },
      include: {
        user: {
          select: {
            defaultPrivacy: true,
          },
        },
      },
    });

    if (!quiz) {
      return c.json({ success: false, error: "Quiz not found" }, 404);
    }

    if (quiz.userId !== userId) {
      return c.json({ success: false, error: "Unauthorized" }, 403);
    }

    const shares = await prisma.customQuizShare.findMany({
      where: { customQuizId },
      include: {
        sharedWith: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: {
        sharedAt: "desc",
      },
    });

    return c.json({
      success: true,
      data: {
        visibility: quiz.user.defaultPrivacy,
        shares,
      }
    });
  } catch (error) {
    console.error("Error fetching quiz shares:", error);
    return c.json({ success: false, error: "Failed to fetch quiz shares" }, 500);
  }
};

/**
 * Get quizzes shared with me
 * Includes: PUBLIC quizzes, FRIENDS quizzes from friends, SPECIFIC quizzes shared with me
 */
export const getSharedWithMe = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;

    // Get my friends (mutual follows)
    const myFollowing = await prisma.follow.findMany({
      where: {
        followerId: userId,
        status: "FOLLOWING",
      },
      select: { followingId: true },
    });

    const followingIds = myFollowing.map((f) => f.followingId);

    const theirFollows = await prisma.follow.findMany({
      where: {
        followerId: { in: followingIds },
        followingId: userId,
        status: "FOLLOWING",
      },
      select: { followerId: true },
    });

    const friendIds = theirFollows.map((f) => f.followerId);

    // Get quizzes:
    // 1. PUBLIC quizzes (not mine) - owner's defaultPrivacy is PUBLIC
    // 2. FRIENDS quizzes from my friends - owner's defaultPrivacy is FRIENDS
    // 3. PRIVATE quizzes explicitly shared with me via CustomQuizShare
    const quizzes = await prisma.customQuiz.findMany({
      where: {
        userId: { not: userId },
        OR: [
          // PUBLIC quizzes from anyone
          {
            user: {
              defaultPrivacy: "PUBLIC"
            }
          },
          // FRIENDS quizzes from my friends
          {
            user: {
              defaultPrivacy: "FRIENDS"
            },
            userId: { in: friendIds },
          },
          // PRIVATE quizzes explicitly shared with me
          {
            user: {
              defaultPrivacy: "PRIVATE"
            },
            sharedWith: {
              some: {
                sharedWithUserId: userId,
              },
            },
          },
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            defaultPrivacy: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            userId: true,
            isDefault: true,
          },
        },
        sharedWith: {
          where: {
            sharedWithUserId: userId,
          },
          select: {
            id: true,
            sharedAt: true,
          },
        },
        _count: {
          select: { questions: true },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Transform quizzes to match SharedQuiz interface expected by frontend
    const mappedQuizzes = quizzes.map((quiz) => {
      // Get the share record for this user (if it exists)
      const shareRecord = quiz.sharedWith && quiz.sharedWith.length > 0 
        ? quiz.sharedWith[0] 
        : null;

      // Map custom categories to general (id: 6) for non-owners
      let categoryName = quiz.category.name;
      if (quiz.category.userId !== null && quiz.category.userId !== userId) {
        categoryName = "General";
      }

      // Transform to SharedQuiz format
      return {
        id: shareRecord?.id || quiz.id,
        documentId: quiz.documentId,
        sharedAt: shareRecord?.sharedAt.toISOString() || quiz.createdAt.toISOString(),
        customQuiz: {
          id: quiz.id,
          name: quiz.name,
          category: categoryName,
          createdAt: quiz.createdAt.toISOString(),
          documentId: quiz.documentId,
          user: quiz.user,
          _count: quiz._count,
        },
      };
    });

    return c.json({ success: true, data: mappedQuizzes });
  } catch (error) {
    console.error("Error fetching shared quizzes:", error);
    return c.json({ success: false, error: "Failed to fetch shared quizzes" }, 500);
  }
};

/**
 * Get my quizzes with share info
 */
export const getMySharedQuizzes = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;

    const quizzes = await prisma.customQuiz.findMany({
      where: { userId },
      include: {
        sharedWith: {
          include: {
            sharedWith: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        _count: {
          select: {
            questions: true,
            sharedWith: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return c.json({ success: true, data: quizzes });
  } catch (error) {
    console.error("Error fetching my quizzes:", error);
    return c.json({ success: false, error: "Failed to fetch quizzes" }, 500);
  }
};

/**
 * Share with multiple specific friends
 */
export const shareWithMultipleFriends = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;
    const { customQuizId, friendUserIds } = await c.req.json();

    if (!customQuizId || !Array.isArray(friendUserIds) || friendUserIds.length === 0) {
      return c.json({ success: false, error: "Missing customQuizId or friendUserIds" }, 400);
    }

    const quiz = await prisma.customQuiz.findUnique({
      where: { id: customQuizId },
    });

    if (!quiz) {
      return c.json({ success: false, error: "Quiz not found" }, 404);
    }

    if (quiz.userId !== userId) {
      return c.json({ success: false, error: "You can only share your own quizzes" }, 403);
    }

    // No need to change visibility - PRIVATE quizzes use CustomQuizShare for access control
    // FRIENDS/PUBLIC quizzes can also have specific shares for additional access

    // Get mutual friends
    const myFollowing = await prisma.follow.findMany({
      where: {
        followerId: userId,
        followingId: { in: friendUserIds },
        status: "FOLLOWING",
      },
      select: { followingId: true },
    });

    const followingIds = myFollowing.map((f) => f.followingId);

    const theirFollows = await prisma.follow.findMany({
      where: {
        followerId: { in: followingIds },
        followingId: userId,
        status: "FOLLOWING",
      },
      select: { followerId: true },
    });

    const mutualFriendIds = theirFollows.map((f) => f.followerId);

    if (mutualFriendIds.length === 0) {
      return c.json({ success: false, error: "None of the specified users are your friends" }, 400);
    }

    const shares = await Promise.all(
      mutualFriendIds.map(async (friendId) => {
        try {
          return await prisma.customQuizShare.create({
            data: {
              customQuizId,
              sharedWithUserId: friendId,
            },
          });
        } catch (error: any) {
          if (error.code === "P2002") {
            return null; // Already shared
          }
          throw error;
        }
      })
    );

    const successfulShares = shares.filter((s) => s !== null);

    // Create notifications for all friends who received the share
    try {
      const sharerName = user.firstName || user.username || "Someone";
      console.log(`📬 Attempting to create ${successfulShares.length} QUIZ_SHARED notifications from ${userId} (${sharerName})`);
      
      await Promise.all(
        successfulShares.map((share) =>
          createNotification({
            userId: share.sharedWithUserId, // Notify each friend receiving the share
            type: "QUIZ_SHARED" as any, // Will work at runtime after Prisma regeneration
            title: "Lesson Shared",
            message: `${sharerName} shared a lesson with you`,
            actionUrl: "/learning/shared",
          })
            .then((notification) => {
              console.log(`✅ Created notification ${notification.id} for user ${share.sharedWithUserId}`);
            })
            .catch((notifError) => {
              console.error(`❌ Failed to create notification for user ${share.sharedWithUserId}:`, notifError);
              console.error("Error details:", notifError instanceof Error ? notifError.message : String(notifError));
              // Don't fail the whole process if notification fails
            })
        )
      );
      
      console.log(`✅ Finished creating notifications for ${successfulShares.length} friends`);
    } catch (notifError) {
      console.error("❌ Failed to create quiz share notifications:", notifError);
      console.error("Error details:", notifError instanceof Error ? notifError.message : String(notifError));
      // Don't fail the whole process if notification fails
    }

    return c.json({
      success: true,
      data: {
        totalShared: successfulShares.length,
        skipped: mutualFriendIds.length - successfulShares.length,
        shares: successfulShares,
      },
    });
  } catch (error) {
    console.error("Error sharing with multiple friends:", error);
    return c.json({ success: false, error: "Failed to share quiz" }, 500);
  }
};

/**
 * Get quizzes from a specific user
 * Shows PUBLIC quizzes and FRIENDS quizzes if they're friends
 */
export const getUserSharedQuizzes = async (c: Context) => {
  try {
    const currentUser = c.get("user");
    const currentUserId = currentUser.id;
    const targetUserId = c.req.param("userId");

    if (!targetUserId) {
      return c.json({ success: false, error: "Missing userId parameter" }, 400);
    }

    // Check if they're friends (mutual follow)
    const yourFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: currentUserId,
          followingId: targetUserId,
        },
      },
    });

    const theirFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: targetUserId,
          followingId: currentUserId,
        },
      },
    });

    const areFriends =
      yourFollow?.status === "FOLLOWING" &&
      theirFollow?.status === "FOLLOWING";

    // Check if user has lesson request access
    const lessonRequest = await prisma.lessonRequest.findUnique({
      where: {
        requesterId_recipientId: {
          requesterId: currentUserId,
          recipientId: targetUserId,
        },
      },
    });

    const hasLessonAccess = lessonRequest?.status === "ACCEPTED";

    // Get the target user's privacy setting
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { defaultPrivacy: true },
    });

    if (!targetUser) {
      return c.json({ success: false, error: "Target user not found" }, 404);
    }

    // If user has lesson access, return ALL quizzes regardless of privacy
    // Otherwise, build query conditions based on friendship status and user's privacy setting
    let whereCondition: any;

    if (hasLessonAccess) {
      // Return all quizzes when lesson request is accepted
      whereCondition = {
        userId: targetUserId,
      };
    } else {
      // Build query conditions based on user's privacy setting and friendship status
      const privacy = targetUser.defaultPrivacy;

      if (privacy === "PUBLIC") {
        // PUBLIC: Everyone can see
        whereCondition = { userId: targetUserId };
      } else if (privacy === "FRIENDS" && areFriends) {
        // FRIENDS: Only friends can see, and we are friends
        whereCondition = { userId: targetUserId };
      } else if (privacy === "PRIVATE") {
        // PRIVATE: Only explicitly shared quizzes
        whereCondition = {
          userId: targetUserId,
          sharedWith: {
            some: {
              sharedWithUserId: currentUserId,
            },
          },
        };
      } else {
        // No access (either FRIENDS and not friends, or invalid state)
        whereCondition = {
          userId: targetUserId,
          id: "impossible-to-match", // Return empty result
        };
      }
    }

    // Get quizzes from the target user
    const quizzes = await prisma.customQuiz.findMany({
      where: whereCondition,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            defaultPrivacy: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            userId: true,
            isDefault: true,
          },
        },
        _count: {
          select: { questions: true },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Map custom categories to general (id: 6) for non-owners
    const mappedQuizzes = quizzes.map((quiz) => {
      // If the quiz has a custom category (userId is set), map it to general for viewers
      if (quiz.category.userId !== null && quiz.category.userId !== currentUserId) {
        return {
          ...quiz,
          categoryId: 6, // General category
          category: {
            id: 6,
            name: "General",
            userId: null,
            isDefault: true,
          },
        };
      }
      return quiz;
    });

    return c.json({ success: true, data: mappedQuizzes });
  } catch (error) {
    console.error("Error fetching user quizzes:", error);
    return c.json({ success: false, error: "Failed to fetch user quizzes" }, 500);
  }
};

/**
 * Check if user can access a quiz
 * Helper function used by quiz controller
 * Now reads visibility from the quiz owner's User.defaultPrivacy setting
 */
export async function canAccessQuiz(userId: string, quiz: any): Promise<boolean> {
  // Owner can always access
  if (quiz.userId === userId) {
    return true;
  }

  // Get the quiz owner's privacy settings
  const quizOwner = await prisma.user.findUnique({
    where: { id: quiz.userId },
    select: { defaultPrivacy: true },
  });

  if (!quizOwner) {
    return false;
  }

  // Check based on owner's default privacy setting
  switch (quizOwner.defaultPrivacy) {
    case "PUBLIC":
      return true;

    case "FRIENDS": {
      // Check if we're friends (mutual follow)
      const yourFollow = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: userId,
            followingId: quiz.userId,
          },
        },
      });

      const theirFollow = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: quiz.userId,
            followingId: userId,
          },
        },
      });

      return (
        yourFollow?.status === "FOLLOWING" &&
        theirFollow?.status === "FOLLOWING"
      );
    }

    case "PRIVATE": {
      // Check if specifically shared with this user via CustomQuizShare table
      const share = await prisma.customQuizShare.findUnique({
        where: {
          customQuizId_sharedWithUserId: {
            customQuizId: quiz.id,
            sharedWithUserId: userId,
          },
        },
      });

      return !!share;
    }

    default:
      return false;
  }
}
