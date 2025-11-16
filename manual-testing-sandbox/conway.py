# 导入PyGame库和标准库
import pygame
import random

# 初始化PyGame和设置窗口
pygame.init()  # 初始化所有导入的pygame模块
screen = pygame.display.set_mode((640, 480))  # 创建显示窗口，大小为640x480
pygame.display.set_caption('PyGame窗口')  # 设置窗口标题

# 设计游戏网格数据结构
rows = 30   # 网格的行数
cols = 40   # 网格的列数
# 创建一个二维数组，初始化每个格子的状态为0（死）
grid = [[0 for _ in range(cols)] for _ in range(rows)]

# 创建主事件循环框架
running = True
while running:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:  # 检测关闭窗口事件
            running = False

pygame.quit()  # 正确退出PyGame