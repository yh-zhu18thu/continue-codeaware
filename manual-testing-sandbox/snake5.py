# 导入pygame及相关模块
import pygame  # 用于开发2D游戏的库
import sys     # 用于系统相关操作（如退出）

# 初始化pygame
pygame.init()

# 设置窗口大小
WINDOW_WIDTH = 640  # 窗口宽度
WINDOW_HEIGHT = 480 # 窗口高度

# 创建游戏主窗口
window = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
# 设置窗口标题
pygame.display.set_caption('贪吃蛇游戏')

# 创建游戏时钟，用于控制刷新频率
clock = pygame.time.Clock()

# 程序主循环的占位符（仅防止窗口闪退，未来会完善）
while True:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            pygame.quit()
            sys.exit()
    
    # 刷新窗口填充背景色（暂时为黑色）
    window.fill((0, 0, 0))
    
    # 更新显示内容
    pygame.display.update()
    
    # 控制帧率（例如每秒15帧）
    clock.tick(15)
