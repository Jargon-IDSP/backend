import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkNotifications() {
  console.log('📬 Checking recent notifications...\n');

  try {
    const notifications = await prisma.notification.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        user: {
          select: {
            username: true,
            firstName: true,
            email: true,
          }
        }
      }
    });

    if (notifications.length === 0) {
      console.log('No notifications found.');
    } else {
      notifications.forEach((notif, index) => {
        console.log(`${index + 1}. [${notif.type}] ${notif.title}`);
        console.log(`   To: ${notif.user.firstName || notif.user.username || notif.user.email}`);
        console.log(`   Message: ${notif.message}`);
        console.log(`   Read: ${notif.isRead}`);
        console.log(`   Created: ${notif.createdAt}`);
        console.log('');
      });
    }
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkNotifications();
