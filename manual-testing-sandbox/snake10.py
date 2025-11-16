# 导入pygame和相关库
import pygame
import sys
import random

# 初始化pygame和设置游戏窗口
pygame.init()  # 初始化pygame

# 定义窗口宽高等参数
WINDOW_WIDTH = 600  # 游戏窗口宽度
WINDOW_HEIGHT = 400  # 游戏窗口高度
BLOCK_SIZE = 20      # 蛇和食物的单个格子大小（像素）
SPEED = 10           # 贪吃蛇的移动速度（帧率）

# 创建窗口
window = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
pygame.display.set_caption('贪吃蛇 Snake by pygame')  # 设置窗口标题

# 定义常用颜色（RGB）
BLACK = (0, 0, 0)       # 背景色
WHITE = (255, 255, 255) # 字体颜色
GREEN = (0, 255, 0)     # 蛇的颜色
RED = (255, 0, 0)       # 食物的颜色

# 创建蛇的数据结构和初始位置
# 蛇是一个列表，每个元素是一个[x, y]表示蛇身每节的坐标
snake = [
    [WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2],
    [WINDOW_WIDTH // 2 - BLOCK_SIZE, WINDOW_HEIGHT // 2],
    [WINDOW_WIDTH // 2 - 2 * BLOCK_SIZE, WINDOW_HEIGHT // 2]
]
# 初始移动方向（向右）
direction = 'RIGHT'

# 生成食物初始位置（随机在网格上，且不与蛇重叠）
def generate_food():
    while True:
        food_x = random.randrange(0, WINDOW_WIDTH, BLOCK_SIZE)
        food_y = random.randrange(0, WINDOW_HEIGHT, BLOCK_SIZE)
        if [food_x, food_y] not in snake:
            return [food_x, food_y]

food_pos = generate_food()

# 设置分数变量
score = 0  # 玩家分数

# 编写主游戏循环骨架
clock = pygame.time.Clock()         # 控制游戏循环的时钟
running = True                      # 游戏主循环的标志

while running:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            pygame.quit()
            sys.exit()
    # 后续的游戏更新、绘制、碰撞检测等将在此循环中补充实现
    
    clock.tick(SPEED)  # 控制贪吃蛇移动速度
