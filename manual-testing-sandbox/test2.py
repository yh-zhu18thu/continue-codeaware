# s-1: 导入pygame及其他基础包
import pygame  # 导入pygame包
import sys     # 用于退出程序
import random  # 若后续需要可用于生成随机数

# s-2: 初始化PyGame和设置窗口参数
pygame.init()  # 初始化pygame

# 设置窗口尺寸
WINDOW_WIDTH = 640
WINDOW_HEIGHT = 480
# 创建窗口 Surface 对象
screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
# 设置窗口标题
pygame.display.set_caption("Pygame窗口示例")
# 设置刷新率（帧率）
clock = pygame.time.Clock()
FPS = 60

# s-3: 设置游戏主循环结构
running = True
while running:
    # 事件处理
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False

    # (此处可添加游戏状态刷新与绘制场景等后续内容)

    # 刷新屏幕
    pygame.display.flip()
    # 控制帧率
    clock.tick(FPS)

# 退出前清理资源
pygame.quit()
sys.exit()
