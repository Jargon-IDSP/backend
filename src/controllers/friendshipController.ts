import type { Context } from "hono";
import { prisma } from "../lib/prisma";

export const sendFriendRequest = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;
    const { addresseeId } = await c.req.json();

    if (!addresseeId) {
      return c.json({ success: false, error: "Addressee ID is required" }, 400);
    }

    if (userId === addresseeId) {
      return c.json({ success: false, error: "Cannot send friend request to yourself" }, 400);
    }

    const addressee = await prisma.user.findUnique({
      where: { id: addresseeId },
    });

    if (!addressee) {
      return c.json({ success: false, error: "User not found" }, 404);
    }

    const existingFriendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: userId, addresseeId },
          { requesterId: addresseeId, addresseeId: userId },
        ],
      },
    });

    if (existingFriendship) {
      if (existingFriendship.status === "ACCEPTED") {
        return c.json({ success: false, error: "Already friends" }, 400);
      }
      return c.json({ success: false, error: "Friend request already sent" }, 400);
    }

    const friendship = await prisma.friendship.create({
      data: {
        requesterId: userId,
        addresseeId,
        status: "PENDING",
      },
    });

    return c.json({ success: true, data: friendship });
  } catch (error) {
    console.error("Error sending friend request:", error);
    return c.json({ success: false, error: "Failed to send friend request" }, 500);
  }
};

export const acceptFriendRequest = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;
    const friendshipId = c.req.param("id");

    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId },
    });

    if (!friendship) {
      return c.json({ success: false, error: "Friendship not found" }, 404);
    }

    if (friendship.addresseeId !== userId) {
      return c.json({ success: false, error: "Unauthorized" }, 403);
    }

    if (friendship.status !== "PENDING") {
      return c.json({ success: false, error: "Friend request is not pending" }, 400);
    }

    const updatedFriendship = await prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: "ACCEPTED" },
    });

    return c.json({ success: true, data: updatedFriendship });
  } catch (error) {
    console.error("Error accepting friend request:", error);
    return c.json({ success: false, error: "Failed to accept friend request" }, 500);
  }
};

export const rejectFriendRequest = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;
    const friendshipId = c.req.param("id");

    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId },
    });

    if (!friendship) {
      return c.json({ success: false, error: "Friendship not found" }, 404);
    }

    if (friendship.addresseeId !== userId) {
      return c.json({ success: false, error: "Unauthorized" }, 403);
    }

    await prisma.friendship.delete({
      where: { id: friendshipId },
    });

    return c.json({ success: true, message: "Friend request rejected" });
  } catch (error) {
    console.error("Error rejecting friend request:", error);
    return c.json({ success: false, error: "Failed to reject friend request" }, 500);
  }
};

export const removeFriend = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;
    const friendshipId = c.req.param("id");

    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId },
    });

    if (!friendship) {
      return c.json({ success: false, error: "Friendship not found" }, 404);
    }

    if (friendship.requesterId !== userId && friendship.addresseeId !== userId) {
      return c.json({ success: false, error: "Unauthorized" }, 403);
    }

    await prisma.friendship.delete({
      where: { id: friendshipId },
    });

    return c.json({ success: true, message: "Friend removed" });
  } catch (error) {
    console.error("Error removing friend:", error);
    return c.json({ success: false, error: "Failed to remove friend" }, 500);
  }
};

export const getFriends = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;

    const friendships = await prisma.friendship.findMany({
      where: {
        AND: [
          {
            OR: [
              { requesterId: userId },
              { addresseeId: userId },
            ],
          },
          { status: "ACCEPTED" },
        ],
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
          },
        },
        addressee: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            email: true,
            score: true,
          },
        },
      },
    });

    const friends = friendships.map((friendship) => {
      const friend = friendship.requesterId === userId ? friendship.addressee : friendship.requester;
      return {
        friendshipId: friendship.id,
        status: friendship.status,
        ...friend,
      };
    });

    return c.json({ success: true, data: friends });
  } catch (error) {
    console.error("Error fetching friends:", error);
    return c.json({ success: false, error: "Failed to fetch friends" }, 500);
  }
};

export const getPendingRequests = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;

    const friendships = await prisma.friendship.findMany({
      where: {
        addresseeId: userId,
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
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const requests = friendships.map((friendship) => ({
      friendshipId: friendship.id,
      ...friendship.requester,
      createdAt: friendship.createdAt,
    }));

    return c.json({ success: true, data: requests });
  } catch (error) {
    console.error("Error fetching pending requests:", error);
    return c.json({ success: false, error: "Failed to fetch pending requests" }, 500);
  }
};

export const getSentRequests = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;

    const friendships = await prisma.friendship.findMany({
      where: {
        requesterId: userId,
        status: "PENDING",
      },
      include: {
        addressee: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            email: true,
            score: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const requests = friendships.map((friendship) => ({
      friendshipId: friendship.id,
      ...friendship.addressee,
      createdAt: friendship.createdAt,
    }));

    return c.json({ success: true, data: requests });
  } catch (error) {
    console.error("Error fetching sent requests:", error);
    return c.json({ success: false, error: "Failed to fetch sent requests" }, 500);
  }
};

export const searchUsers = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;
    const query = c.req.query("q");

    if (!query || query.length < 2) {
      return c.json({ success: false, error: "Search query must be at least 2 characters" }, 400);
    }

    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: userId } }, 
          {
            OR: [
              { username: { contains: query } },
              { email: { contains: query } },
              { firstName: { contains: query } },
              { lastName: { contains: query } },
            ],
          },
        ],
      },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        email: true,
        score: true,
      },
      take: 10,
    });

    const userIds = users.map((u) => u.id);
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: userId, addresseeId: { in: userIds } },
          { requesterId: { in: userIds }, addresseeId: userId },
        ],
      },
    });

    const results = users.map((user) => {
      const friendship = friendships.find(
        (f) =>
          (f.requesterId === userId && f.addresseeId === user.id) ||
          (f.addresseeId === userId && f.requesterId === user.id)
      );

      let friendshipStatus = "none";
      let friendshipId = null;
      let status = null;

      if (friendship) {
        friendshipId = friendship.id;
        status = friendship.status;
        if (friendship.status === "ACCEPTED") {
          friendshipStatus = "friends";
        } else if (friendship.status === "BLOCKED") {
          friendshipStatus = "blocked";
        } else if (friendship.requesterId === userId) {
          friendshipStatus = "pending_sent";
        } else {
          friendshipStatus = "pending_received";
        }
      }

      return {
        ...user,
        friendshipStatus,
        friendshipId,
        status,
      };
    });

    return c.json({ success: true, data: results });
  } catch (error) {
    console.error("Error searching users:", error);
    return c.json({ success: false, error: "Failed to search users" }, 500);
  }
};
