import type { Context } from "hono";
import { prisma } from "../lib/prisma";
import { createNotification } from "../services/notificationService";

/**
 * Update quiz visibility
 * Sets the quiz to PRIVATE, FRIENDS, PUBLIC, or SPECIFIC
 */
export const updateQuizVisibility = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;
    const { customQuizId, visibility } = await c.req.json();

    if (!customQuizId || !visibility) {
      return c.json({ success: false, error: "Missing customQuizId or visibility" }, 400);
    }

    const validVisibility = ["PRIVATE", "FRIENDS", "PUBLIC", "SPECIFIC"];
    if (!validVisibility.includes(visibility)) {
      return c.json({ success: false, error: "Invalid visibility value" }, 400);
    }

    const quiz = await prisma.customQuiz.findUnique({
      where: { id: customQuizId },
    });

    if (!quiz) {
      return c.json({ success: false, error: "Quiz not found" }, 404);
    }

    if (quiz.userId !== userId) {
      return c.json({ success: false, error: "You can only update your own quizzes" }, 403);
    }

    const updatedQuiz = await prisma.customQuiz.update({
      where: { id: customQuizId },
      data: { visibility },
    });

    // If changing away from SPECIFIC, optionally clear specific shares
    if (visibility !== "SPECIFIC" && quiz.visibility === "SPECIFIC") {
      await prisma.customQuizShare.deleteMany({
        where: { customQuizId },
      });
    }

    return c.json({ success: true, data: updatedQuiz });
  } catch (error) {
    console.error("Error updating quiz visibility:", error);
    return c.json({ success: false, error: "Failed to update quiz visibility" }, 500);
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

    // Automatically set visibility to SPECIFIC if it's not already set
    if (quiz.visibility !== "SPECIFIC") {
      await prisma.customQuiz.update({
        where: { id: customQuizId },
        data: { visibility: "SPECIFIC" },
      });
    }

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
 */
export const getQuizShares = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;
    const customQuizId = c.req.param("quizId");

    const quiz = await prisma.customQuiz.findUnique({
      where: { id: customQuizId },
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
        visibility: quiz.visibility,
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
    // 1. PUBLIC quizzes (not mine)
    // 2. FRIENDS quizzes from my friends
    // 3. SPECIFIC quizzes explicitly shared with me
    const quizzes = await prisma.customQuiz.findMany({
      where: {
        userId: { not: userId },
        OR: [
          { visibility: "PUBLIC" },
          {
            visibility: "FRIENDS",
            userId: { in: friendIds },
          },
          {
            visibility: "SPECIFIC",
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

    // Automatically set visibility to SPECIFIC if it's not already set
    if (quiz.visibility !== "SPECIFIC") {
      await prisma.customQuiz.update({
        where: { id: customQuizId },
        data: { visibility: "SPECIFIC" },
      });
    }

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

    // If user has lesson access, return ALL quizzes regardless of visibility
    // Otherwise, build query conditions based on friendship status
    let whereCondition: any;

    if (hasLessonAccess) {
      // Return all quizzes when lesson request is accepted
      whereCondition = {
        userId: targetUserId,
      };
    } else {
      // Build query conditions based on friendship status
      const visibilityConditions: any[] = [{ visibility: "PUBLIC" }];

      if (areFriends) {
        visibilityConditions.push({ visibility: "FRIENDS" });
      }

      whereCondition = {
        userId: targetUserId,
        OR: visibilityConditions,
      };
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
 */
export async function canAccessQuiz(userId: string, quiz: any): Promise<boolean> {
  // Owner can always access
  if (quiz.userId === userId) {
    return true;
  }

  // Check based on visibility
  switch (quiz.visibility) {
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

    case "SPECIFIC": {
      // Check if specifically shared with this user
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

    case "PRIVATE":
    default:
      return false;
  }
}
