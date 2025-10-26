import type { Context } from "hono";
import { prisma } from "../lib/prisma";

export const shareQuiz = async (c: Context) => {
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

    const friendship = await prisma.friendship.findFirst({
      where: {
        AND: [
          {
            OR: [
              { requesterId: userId, addresseeId: friendUserId },
              { requesterId: friendUserId, addresseeId: userId },
            ],
          },
          { status: "ACCEPTED" },
        ],
      },
    });

    if (!friendship) {
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
        customQuiz: {
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
        },
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

    return c.json({ success: true, data: share });
  } catch (error) {
    console.error("Error sharing quiz:", error);
    return c.json({ success: false, error: "Failed to share quiz" }, 500);
  }
};

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

    return c.json({ success: true, data: shares });
  } catch (error) {
    console.error("Error fetching quiz shares:", error);
    return c.json({ success: false, error: "Failed to fetch quiz shares" }, 500);
  }
};

export const getSharedWithMe = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;

    const shares = await prisma.customQuizShare.findMany({
      where: { sharedWithUserId: userId },
      include: {
        customQuiz: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
              },
            },
            _count: {
              select: { questions: true },
            },
          },
        },
      },
      orderBy: {
        sharedAt: "desc",
      },
    });

    return c.json({ success: true, data: shares });
  } catch (error) {
    console.error("Error fetching shared quizzes:", error);
    return c.json({ success: false, error: "Failed to fetch shared quizzes" }, 500);
  }
};

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
    console.error("Error fetching my shared quizzes:", error);
    return c.json({ success: false, error: "Failed to fetch quizzes" }, 500);
  }
};

export const shareWithMultiple = async (c: Context) => {
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

    const friendships = await prisma.friendship.findMany({
      where: {
        AND: [
          {
            OR: [
              { requesterId: userId, addresseeId: { in: friendUserIds } },
              { requesterId: { in: friendUserIds }, addresseeId: userId },
            ],
          },
          { status: "ACCEPTED" },
        ],
      },
    });

    const friendIds = friendships.map((f) =>
      f.requesterId === userId ? f.addresseeId : f.requesterId
    );

    const validFriendIds = friendUserIds.filter((id) => friendIds.includes(id));

    if (validFriendIds.length === 0) {
      return c.json({ success: false, error: "None of the specified users are your friends" }, 400);
    }

    const shares = await Promise.all(
      validFriendIds.map(async (friendId) => {
        try {
          return await prisma.customQuizShare.create({
            data: {
              customQuizId,
              sharedWithUserId: friendId,
            },
          });
        } catch (error: any) {
          if (error.code === "P2002") {
            return null;
          }
          throw error;
        }
      })
    );

    const successfulShares = shares.filter((s) => s !== null);

    return c.json({
      success: true,
      data: {
        totalShared: successfulShares.length,
        skipped: validFriendIds.length - successfulShares.length,
        shares: successfulShares,
      },
    });
  } catch (error) {
    console.error("Error sharing with multiple friends:", error);
    return c.json({ success: false, error: "Failed to share quiz" }, 500);
  }
};
