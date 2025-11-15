# 导入所需包
import pygame       # 用于游戏窗口和图形渲染
import sys          # 用于系统相关操作，例如退出程序

# 初始化PyGame与创建游戏窗口
pygame.init()       # 初始化所有PyGame模块

# 设置游戏窗口大小和标题
WINDOW_WIDTH = 300      # 宽度（可以根据后续项目需求调整）
WINDOW_HEIGHT = 600     # 高度（可以根据后续项目需求调整）

screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))     # 创建窗口
pygame.display.set_caption('俄罗斯方块')                            # 设置窗口标题

# 用一个主循环保持窗口显示，为后续实现做准备
while True:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            pygame.quit()
            sys.exit()
    screen.fill((0,0,0))    # 填充背景为黑色
    pygame.display.flip()   # 更新窗口显示
