import type { Context } from "hono";
import { prisma } from "../lib/prisma";
import { createNotification } from "../services/notificationService";

/**
 * Follow a user
 * Creates a one-way follow relationship
 */
export const followUser = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;
    const { followingId } = await c.req.json();

    if (!followingId) {
      return c.json({ success: false, error: "User ID is required" }, 400);
    }

    if (userId === followingId) {
      return c.json({ success: false, error: "Cannot follow yourself" }, 400);
    }

    const userToFollow = await prisma.user.findUnique({
      where: { id: followingId },
    });

    if (!userToFollow) {
      return c.json({ success: false, error: "User not found" }, 404);
    }

    // Check if already following
    const existingFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: userId,
          followingId,
        },
      },
    });

    if (existingFollow) {
      if (existingFollow.status === "BLOCKED") {
        return c.json({ success: false, error: "Cannot follow this user" }, 400);
      }
      return c.json({ success: false, error: "Already following this user" }, 400);
    }

    // Check if the other user blocked you
    const blockedByThem = await prisma.follow.findFirst({
      where: {
        followerId: followingId,
        followingId: userId,
        status: "BLOCKED",
      },
    });

    if (blockedByThem) {
      return c.json({ success: false, error: "Cannot follow this user" }, 403);
    }

    const follow = await prisma.follow.create({
      data: {
        followerId: userId,
        followingId,
        status: "FOLLOWING",
      },
    });

    // Create notification for the user being followed
    try {
      await createNotification({
        userId: followingId, // Notify the person being followed
        type: "FRIEND_REQUEST",
        title: "New Friend Request",
        message: `${user.firstName || user.username || "Someone"} followed you!`,
        actionUrl: `/profile/friends/${userId}`,
        followId: follow.id,
      });
    } catch (notifError) {
      console.error("Failed to create follow notification:", notifError);
      // Don't fail the whole process if notification fails
    }

    return c.json({ success: true, data: follow });
  } catch (error) {
    console.error("Error following user:", error);
    return c.json({ success: false, error: "Failed to follow user" }, 500);
  }
};

/**
 * Unfollow a user
 * Removes the follow relationship
 */
export const unfollowUser = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;
    const followId = c.req.param("id");

    const follow = await prisma.follow.findUnique({
      where: { id: followId },
    });

    if (!follow) {
      return c.json({ success: false, error: "Follow relationship not found" }, 404);
    }

    if (follow.followerId !== userId) {
      return c.json({ success: false, error: "Unauthorized" }, 403);
    }

    await prisma.follow.delete({
      where: { id: followId },
    });

    return c.json({ success: true, message: "Unfollowed successfully" });
  } catch (error) {
    console.error("Error unfollowing user:", error);
    return c.json({ success: false, error: "Failed to unfollow user" }, 500);
  }
};

/**
 * Block a user
 * Creates or updates follow relationship to BLOCKED status
 */
export const blockUser = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;
    const { blockedUserId } = await c.req.json();

    if (!blockedUserId) {
      return c.json({ success: false, error: "User ID is required" }, 400);
    }

    if (userId === blockedUserId) {
      return c.json({ success: false, error: "Cannot block yourself" }, 400);
    }

    // Create or update the block relationship
    const block = await prisma.follow.upsert({
      where: {
        followerId_followingId: {
          followerId: userId,
          followingId: blockedUserId,
        },
      },
      update: {
        status: "BLOCKED",
      },
      create: {
        followerId: userId,
        followingId: blockedUserId,
        status: "BLOCKED",
      },
    });

    return c.json({ success: true, data: block });
  } catch (error) {
    console.error("Error blocking user:", error);
    return c.json({ success: false, error: "Failed to block user" }, 500);
  }
};

/**
 * Unblock a user
 * Removes the block relationship
 */
export const unblockUser = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;
    const blockId = c.req.param("id");

    const block = await prisma.follow.findUnique({
      where: { id: blockId },
    });

    if (!block) {
      return c.json({ success: false, error: "Block not found" }, 404);
    }

    if (block.followerId !== userId) {
      return c.json({ success: false, error: "Unauthorized" }, 403);
    }

    if (block.status !== "BLOCKED") {
      return c.json({ success: false, error: "This is not a block relationship" }, 400);
    }

    await prisma.follow.delete({
      where: { id: blockId },
    });

    return c.json({ success: true, message: "Unblocked successfully" });
  } catch (error) {
    console.error("Error unblocking user:", error);
    return c.json({ success: false, error: "Failed to unblock user" }, 500);
  }
};

/**
 * Get users you are following
 */
export const getFollowing = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;

    const follows = await prisma.follow.findMany({
      where: {
        followerId: userId,
        status: "FOLLOWING",
      },
      include: {
        following: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            email: true,
            score: true,
            industryId: true,
            language: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const following = follows.map((follow) => ({
      friendshipId: follow.id,
      ...follow.following,
      followedAt: follow.createdAt,
    }));

    return c.json({ success: true, data: following });
  } catch (error) {
    console.error("Error fetching following:", error);
    return c.json({ success: false, error: "Failed to fetch following" }, 500);
  }
};

/**
 * Get your followers
 */
export const getFollowers = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;

    const follows = await prisma.follow.findMany({
      where: {
        followingId: userId,
        status: "FOLLOWING",
      },
      include: {
        follower: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            email: true,
            score: true,
            industryId: true,
            language: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const followers = follows.map((follow) => ({
      friendshipId: follow.id,
      ...follow.follower,
      followedAt: follow.createdAt,
    }));

    return c.json({ success: true, data: followers });
  } catch (error) {
    console.error("Error fetching followers:", error);
    return c.json({ success: false, error: "Failed to fetch followers" }, 500);
  }
};

/**
 * Get follower count for a specific user
 */
export const getFollowerCount = async (c: Context) => {
  try {
    const userId = c.req.param("userId");
    
    if (!userId) {
      return c.json({ success: false, error: "User ID is required" }, 400);
    }

    const count = await prisma.follow.count({
      where: {
        followingId: userId,
        status: "FOLLOWING",
      },
    });

    return c.json({ success: true, data: { count } });
  } catch (error) {
    console.error("Error fetching follower count:", error);
    return c.json({ success: false, error: "Failed to fetch follower count" }, 500);
  }
};

/**
 * Get following count for a specific user
 */
export const getFollowingCount = async (c: Context) => {
  try {
    const userId = c.req.param("userId");
    
    if (!userId) {
      return c.json({ success: false, error: "User ID is required" }, 400);
    }

    const count = await prisma.follow.count({
      where: {
        followerId: userId,
        status: "FOLLOWING",
      },
    });

    return c.json({ success: true, data: { count } });
  } catch (error) {
    console.error("Error fetching following count:", error);
    return c.json({ success: false, error: "Failed to fetch following count" }, 500);
  }
};

/**
 * Get friends (mutual follows)
 * Returns users where both users are following each other
 */
export const getFriends = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;

    // Get all users you're following
    const following = await prisma.follow.findMany({
      where: {
        followerId: userId,
        status: "FOLLOWING",
      },
      select: {
        id: true,
        followingId: true,
        following: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            email: true,
            score: true,
            industryId: true,
            language: true,
            createdAt: true,
          },
        },
      },
    });

    const followingIds = following.map((f) => f.followingId);

    // Get which of those users are also following you back (mutual)
    const mutualFollows = await prisma.follow.findMany({
      where: {
        followerId: { in: followingIds },
        followingId: userId,
        status: "FOLLOWING",
      },
      select: {
        followerId: true,
      },
    });

    const mutualIds = new Set(mutualFollows.map((f) => f.followerId));

    // Filter to only return mutual friends
    const friends = following
      .filter((f) => mutualIds.has(f.followingId))
      .map((f) => ({
        friendshipId: f.id,
        ...f.following,
      }));

    return c.json({ success: true, data: friends });
  } catch (error) {
    console.error("Error fetching friends:", error);
    return c.json({ success: false, error: "Failed to fetch friends" }, 500);
  }
};

/**
 * Get blocked users
 */
export const getBlockedUsers = async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;

    const blocks = await prisma.follow.findMany({
      where: {
        followerId: userId,
        status: "BLOCKED",
      },
      include: {
        following: {
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
        createdAt: "desc",
      },
    });

    const blockedUsers = blocks.map((block) => ({
      blockId: block.id,
      ...block.following,
      blockedAt: block.createdAt,
    }));

    return c.json({ success: true, data: blockedUsers });
  } catch (error) {
    console.error("Error fetching blocked users:", error);
    return c.json({ success: false, error: "Failed to fetch blocked users" }, 500);
  }
};

/**
 * Search users with follow status
 */
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

    // Check which users you're following
    const youFollowing = await prisma.follow.findMany({
      where: {
        followerId: userId,
        followingId: { in: userIds },
      },
    });

    // Check which users are following you
    const followingYou = await prisma.follow.findMany({
      where: {
        followerId: { in: userIds },
        followingId: userId,
      },
    });

    const youFollowingMap = new Map(
      youFollowing.map((f) => [f.followingId, f])
    );
    const followingYouMap = new Map(
      followingYou.map((f) => [f.followerId, f])
    );

    const results = users.map((user) => {
      const youFollow = youFollowingMap.get(user.id);
      const theyFollow = followingYouMap.get(user.id);

      let friendshipStatus = "none";
      let friendshipId = null;

      if (youFollow) {
        friendshipId = youFollow.id;
        if (youFollow.status === "BLOCKED") {
          friendshipStatus = "blocked_by_you";
        } else if (theyFollow && theyFollow.status === "FOLLOWING") {
          friendshipStatus = "friends"; // Mutual follow
        } else {
          friendshipStatus = "following";
        }
      } else if (theyFollow) {
        if (theyFollow.status === "BLOCKED") {
          friendshipStatus = "blocked_by_them";
        } else {
          friendshipStatus = "follower";
        }
      }

      return {
        ...user,
        friendshipStatus,
        friendshipId,
      };
    });

    return c.json({ success: true, data: results });
  } catch (error) {
    console.error("Error searching users:", error);
    return c.json({ success: false, error: "Failed to search users" }, 500);
  }
};
