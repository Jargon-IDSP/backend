// controllers/avatarController.ts
export const avatar = async (c: Context) => {
  const user = c.get("user");
  
  let userAvatar = await prisma.userAvatar.findUnique({
    where: { userId: user.id }
  });
  
  if (!userAvatar) {
    userAvatar = await prisma.userAvatar.create({
      data: {
        userId: user.id,
        character: "rocky",
        outfit: "default",
        primaryColor: "#FFB6C1",
        secondaryColor: "#FF69B4",
        accentColor: "#FFC0CB",
        unlockedItems: "[]"  // Set here when creating
      }
    });
  }
  
  return c.json({ 
    avatarConfig: {
      character: userAvatar.character,
      outfit: userAvatar.outfit,
      hatType: userAvatar.hatType,
      accessories: [
        userAvatar.accessory1,
        userAvatar.accessory2,
        userAvatar.accessory3
      ].filter(Boolean),
      colors: {
        primary: userAvatar.primaryColor,
        secondary: userAvatar.secondaryColor,
        accent: userAvatar.accentColor
      },
      unlockedItems: JSON.parse(userAvatar.unlockedItems || "[]") 
    }
  }, 200);
};