# 导入pygame和必要包
import pygame  # 用于游戏窗口、绘图和事件处理
import sys     # 便于退出程序

# 初始化pygame
pygame.init()

# 设置窗口尺寸和标题
WINDOW_WIDTH = 640
WINDOW_HEIGHT = 480
WINDOW_TITLE = "贪吃蛇小游戏"
FPS = 15  # 刷新帧率

# 创建窗口和设置标题
screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
pygame.display.set_caption(WINDOW_TITLE)
clock = pygame.time.Clock()  # 用于控制游戏循环刷新速度

# =============== 主游戏循环 ===============
# 游戏主循环会持续运行，接收并处理事件（如键盘输入）、刷新画面等
running = True
while running:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            pygame.quit()
            sys.exit()  # 完全退出程序
    
    # 用白色填充背景
    screen.fill((255, 255, 255))

    # 刷新显示内容
    pygame.display.flip()
    clock.tick(FPS)  # 控制帧率，避免运行过快
