# 导入pygame库和其他所需库
import pygame
import random

# 初始化pygame
pygame.init()

# 设置窗口尺寸和标题
WINDOW_WIDTH, WINDOW_HEIGHT = 640, 480
screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
pygame.display.set_caption("小游戏窗口")

# 创建时钟对象并设置帧率
clock = pygame.time.Clock()
FPS = 60  # 每秒帧数
