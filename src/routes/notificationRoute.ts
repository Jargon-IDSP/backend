import { Hono } from "hono";
import { authMiddleware } from "../middleware/authMiddleware";
import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  removeNotification,
} from "../controllers/notificationController";

const notificationRoute = new Hono();

// Apply auth middleware to all routes
notificationRoute.use("*", authMiddleware);

// Get all notifications
notificationRoute.get("/", getNotifications);

// Get unread count
notificationRoute.get("/unread-count", getUnreadNotificationCount);

// Mark all as read
notificationRoute.patch("/read-all", markAllNotificationsAsRead);

// Mark specific notification as read
notificationRoute.patch("/:id/read", markNotificationAsRead);

// Delete notification
notificationRoute.delete("/:id", removeNotification);

export { notificationRoute };
