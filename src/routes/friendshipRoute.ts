import { Hono } from "hono";
import type { Context } from "hono";
import {
  followUser,
  unfollowUser,
  blockUser,
  unblockUser,
  getFollowing,
  getFollowers,
  getFollowerCount,
  getFollowingCount,
  getFriends,
  getBlockedUsers,
  searchUsers,
  getFriendSuggestions,
} from "../controllers/friendshipController";
import { authMiddleware } from "../middleware/authMiddleware";

const friendshipRoute = new Hono();

friendshipRoute.use("*", authMiddleware);

// Search users
friendshipRoute.get("/search", searchUsers);

// Get friend suggestions
friendshipRoute.get("/suggestions", getFriendSuggestions);

// Get relationships
friendshipRoute.get("/friends", getFriends);
friendshipRoute.get("/following", getFollowing);
friendshipRoute.get("/followers", getFollowers);
friendshipRoute.get("/blocked", getBlockedUsers);

// Get counts for a specific user
friendshipRoute.get("/:userId/followers/count", getFollowerCount);
friendshipRoute.get("/:userId/following/count", getFollowingCount);

// Follow/Unfollow
friendshipRoute.post("/follow", followUser);
friendshipRoute.delete("/:id/unfollow", unfollowUser);

// Block/Unblock
friendshipRoute.post("/block", blockUser);
friendshipRoute.delete("/:id/unblock", unblockUser);

// Backward-compatible routes for frontend (legacy)
// POST /friendships with addresseeId -> follow user
friendshipRoute.post("/", async (c: Context) => {
  try {
    const user = c.get("user");
    const userId = user.id;
    const body = await c.req.json();

    // Map addresseeId to followingId
    const followingId = body.addresseeId;

    if (!followingId) {
      return c.json({ success: false, error: "User ID is required" }, 400);
    }

    if (userId === followingId) {
      return c.json({ success: false, error: "Cannot follow yourself" }, 400);
    }

    const { prisma } = await import("../lib/prisma");

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
      const { createNotification } = await import("../services/notificationService");
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
});

// GET /friendships -> get friends list with proper format
friendshipRoute.get("/", async (c: Context) => {
  // Get friends and followers to return all relationships
  const user = c.get("user");
  const userId = user.id;

  const { prisma } = await import("../lib/prisma");

  // Get all following relationships
  const following = await prisma.follow.findMany({
    where: {
      followerId: userId,
      status: "FOLLOWING",
    },
    select: {
      id: true,
      followingId: true,
      createdAt: true,
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
          avatar: {
            select: {
              body: true,
              bodyColor: true,
              expression: true,
              hair: true,
              headwear: true,
              eyewear: true,
              facial: true,
              clothing: true,
              shoes: true,
              accessories: true,
            },
          },
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

  // Format response with FOLLOWING status
  const friends = following.map((follow) => {
    const isMutual = mutualIds.has(follow.followingId);
    return {
      id: follow.following.id,
      username: follow.following.username,
      firstName: follow.following.firstName,
      lastName: follow.following.lastName,
      email: follow.following.email,
      score: follow.following.score,
      industryId: follow.following.industryId,
      language: follow.following.language,
      avatar: follow.following.avatar,
      friendshipId: follow.id,
      status: "FOLLOWING", // Always FOLLOWING since we're filtering for that status
      isMutual, // Add flag to indicate if it's mutual (friends)
      followedAt: follow.createdAt,
    };
  });

  return c.json({ success: true, data: friends });
});

// DELETE /friendships/:id -> unfollow user
friendshipRoute.delete("/:id", unfollowUser);

export default friendshipRoute;
