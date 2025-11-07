import type { Context } from "hono";
import { prisma } from "../lib/prisma";
import { createNotification } from "../services/notificationService";

/**
 * Create a lesson request
 */
export const createLessonRequest = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;
    const { recipientId } = await c.req.json();

    if (!recipientId) {
      return c.json({ success: false, error: "Recipient ID is required" }, 400);
    }

    if (userId === recipientId) {
      return c.json({ success: false, error: "Cannot request lessons from yourself" }, 400);
    }

    // Check if they are friends (mutual follow)
    const yourFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: userId,
          followingId: recipientId,
        },
      },
    });

    const theirFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: recipientId,
          followingId: userId,
        },
      },
    });

    const areFriends =
      yourFollow?.status === "FOLLOWING" &&
      theirFollow?.status === "FOLLOWING";

    if (!areFriends) {
      return c.json({ success: false, error: "You must be friends to request lessons" }, 400);
    }

    // Check if request already exists
    const existingRequest = await prisma.lessonRequest.findUnique({
      where: {
        requesterId_recipientId: {
          requesterId: userId,
          recipientId,
        },
      },
    });

    if (existingRequest) {
      if (existingRequest.status === "PENDING") {
        return c.json({ success: false, error: "Request already pending" }, 400);
      }
      // If ACCEPTED or DENIED, reset to PENDING (user may have been removed and re-added as friend)
      // This allows re-requesting access after friendship changes
      const updated = await prisma.lessonRequest.update({
        where: { id: existingRequest.id },
        data: { 
          status: "PENDING", 
          createdAt: new Date(), // Reset creation time for new request
          updatedAt: new Date() 
        },
      });
      return c.json({ success: true, data: updated });
    }

    const request = await prisma.lessonRequest.create({
      data: {
        requesterId: userId,
        recipientId,
        status: "PENDING",
      },
    });

    return c.json({ success: true, data: request });
  } catch (error) {
    console.error("Error creating lesson request:", error);
    return c.json({ success: false, error: "Failed to create lesson request" }, 500);
  }
};

/**
 * Cancel a lesson request
 */
export const cancelLessonRequest = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;
    const { recipientId } = await c.req.json();

    if (!recipientId) {
      return c.json({ success: false, error: "Recipient ID is required" }, 400);
    }

    const request = await prisma.lessonRequest.findUnique({
      where: {
        requesterId_recipientId: {
          requesterId: userId,
          recipientId,
        },
      },
    });

    if (!request) {
      return c.json({ success: false, error: "Request not found" }, 404);
    }

    if (request.status !== "PENDING") {
      return c.json({ success: false, error: "Can only cancel pending requests" }, 400);
    }

    await prisma.lessonRequest.delete({
      where: { id: request.id },
    });

    return c.json({ success: true, message: "Request cancelled" });
  } catch (error) {
    console.error("Error cancelling lesson request:", error);
    return c.json({ success: false, error: "Failed to cancel lesson request" }, 500);
  }
};

/**
 * Accept a lesson request
 */
export const acceptLessonRequest = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;
    const { requesterId } = await c.req.json();

    if (!requesterId) {
      return c.json({ success: false, error: "Requester ID is required" }, 400);
    }

    const request = await prisma.lessonRequest.findUnique({
      where: {
        requesterId_recipientId: {
          requesterId,
          recipientId: userId,
        },
      },
    });

    if (!request) {
      return c.json({ success: false, error: "Request not found" }, 404);
    }

    if (request.status !== "PENDING") {
      return c.json({ success: false, error: "Request is not pending" }, 400);
    }

    const updated = await prisma.lessonRequest.update({
      where: { id: request.id },
      data: { status: "ACCEPTED", updatedAt: new Date() },
    });

    // Create notification for the requester
    try {
      await createNotification({
        userId: requesterId, // Notify the person who requested access
        type: "LESSON_APPROVED",
        title: "Lesson Access Granted!",
        message: `${user.firstName || user.username || "Someone"} has granted you access to their lessons.`,
        actionUrl: `/profile/${userId}`,
        lessonRequestId: request.id,
      });
    } catch (notifError) {
      console.error("Failed to create lesson approval notification:", notifError);
      // Don't fail the whole process if notification fails
    }

    return c.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error accepting lesson request:", error);
    return c.json({ success: false, error: "Failed to accept lesson request" }, 500);
  }
};

/**
 * Deny a lesson request
 */
export const denyLessonRequest = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;
    const { requesterId } = await c.req.json();

    if (!requesterId) {
      return c.json({ success: false, error: "Requester ID is required" }, 400);
    }

    const request = await prisma.lessonRequest.findUnique({
      where: {
        requesterId_recipientId: {
          requesterId,
          recipientId: userId,
        },
      },
    });

    if (!request) {
      return c.json({ success: false, error: "Request not found" }, 404);
    }

    if (request.status !== "PENDING") {
      return c.json({ success: false, error: "Request is not pending" }, 400);
    }

    const updated = await prisma.lessonRequest.update({
      where: { id: request.id },
      data: { status: "DENIED", updatedAt: new Date() },
    });

    return c.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error denying lesson request:", error);
    return c.json({ success: false, error: "Failed to deny lesson request" }, 500);
  }
};

/**
 * Get lesson requests for the current user (received)
 */
export const getLessonRequests = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;

    const requests = await prisma.lessonRequest.findMany({
      where: {
        recipientId: userId,
        status: "PENDING",
      },
      include: {
        requester: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            email: true,
            score: true,
            industryId: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return c.json({ success: true, data: requests });
  } catch (error) {
    console.error("Error fetching lesson requests:", error);
    return c.json({ success: false, error: "Failed to fetch lesson requests" }, 500);
  }
};

/**
 * Check if user has access to another user's lessons
 */
export const checkLessonAccess = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;
    const targetUserId = c.req.param("userId");

    if (!targetUserId) {
      return c.json({ success: false, error: "User ID is required" }, 400);
    }

    if (userId === targetUserId) {
      return c.json({ success: true, data: { hasAccess: true } });
    }

    const request = await prisma.lessonRequest.findUnique({
      where: {
        requesterId_recipientId: {
          requesterId: userId,
          recipientId: targetUserId,
        },
      },
    });

    const hasAccess = request?.status === "ACCEPTED";

    return c.json({ success: true, data: { hasAccess } });
  } catch (error) {
    console.error("Error checking lesson access:", error);
    return c.json({ success: false, error: "Failed to check lesson access" }, 500);
  }
};

/**
 * Get lesson request status between two users
 */
export const getLessonRequestStatus = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;
    const targetUserId = c.req.param("userId");

    if (!targetUserId) {
      return c.json({ success: false, error: "User ID is required" }, 400);
    }

    const request = await prisma.lessonRequest.findUnique({
      where: {
        requesterId_recipientId: {
          requesterId: userId,
          recipientId: targetUserId,
        },
      },
    });

    return c.json({
      success: true,
      data: {
        status: request?.status || null,
        hasAccess: request?.status === "ACCEPTED",
      },
    });
  } catch (error) {
    console.error("Error getting lesson request status:", error);
    return c.json({ success: false, error: "Failed to get lesson request status" }, 500);
  }
};

