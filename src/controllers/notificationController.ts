import type { Context } from "hono";
import {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from "../services/notificationService";

/**
 * GET /notifications
 * Get all notifications for the authenticated user
 */
export const getNotifications = async (c: Context) => {
  try {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const limit = Number(c.req.query("limit")) || 50;
    const notifications = await getUserNotifications(user.id, limit);

    return c.json({ success: true, data: notifications });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return c.json({ success: false, error: "Failed to fetch notifications" }, 500);
  }
};

/**
 * GET /notifications/unread-count
 * Get count of unread notifications
 */
export const getUnreadNotificationCount = async (c: Context) => {
  try {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const count = await getUnreadCount(user.id);

    return c.json({ success: true, data: { count } });
  } catch (error) {
    console.error("Error fetching unread count:", error);
    return c.json({ success: false, error: "Failed to fetch unread count" }, 500);
  }
};

/**
 * PATCH /notifications/:id/read
 * Mark a notification as read
 */
export const markNotificationAsRead = async (c: Context) => {
  try {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const notificationId = c.req.param("id");
    await markAsRead(notificationId, user.id);

    return c.json({ success: true, message: "Notification marked as read" });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return c.json({ success: false, error: "Failed to mark notification as read" }, 500);
  }
};

/**
 * PATCH /notifications/read-all
 * Mark all notifications as read
 */
export const markAllNotificationsAsRead = async (c: Context) => {
  try {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const result = await markAllAsRead(user.id);

    return c.json({
      success: true,
      message: "All notifications marked as read",
      data: { count: result.count }
    });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    return c.json({ success: false, error: "Failed to mark all notifications as read" }, 500);
  }
};

/**
 * DELETE /notifications/:id
 * Delete a notification
 */
export const removeNotification = async (c: Context) => {
  try {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const notificationId = c.req.param("id");
    await deleteNotification(notificationId, user.id);

    return c.json({ success: true, message: "Notification deleted" });
  } catch (error) {
    console.error("Error deleting notification:", error);
    return c.json({ success: false, error: "Failed to delete notification" }, 500);
  }
};
