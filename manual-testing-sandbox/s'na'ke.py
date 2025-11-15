# 导入PyGame及其他所需包
import pygame  # 用于游戏窗口和图形绘制
import sys     # 用于系统退出
import random  # 用于生成随机食物位置

# 初始化PyGame
pygame.init()  # 激活PyGame所有模块

# 设置游戏窗口大小和标题
WINDOW_WIDTH = 600
WINDOW_HEIGHT = 400
WINDOW_SIZE = (WINDOW_WIDTH, WINDOW_HEIGHT)
window = pygame.display.set_mode(WINDOW_SIZE)  # 创建主窗口
pygame.display.set_caption('贪吃蛇小游戏')     # 设置窗口标题

# 设置游戏时钟
clock = pygame.time.Clock()  # 控制游戏帧率和动画流畅度

# 定义颜色和基础参数
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
GREEN = (0, 255, 0)
RED = (255, 0, 0)

BLOCK_SIZE = 20       # 每一节的像素尺寸（正方形）
SNAKE_SPEED = 15      # 贪吃蛇移动速度（帧/秒）

# 初始化蛇的初始位置与长度
snake = []  # 用列表存储蛇每一节的位置: 每一项是[x, y]坐标
snake_length = 3      # 初始长度
# 初始位置为屏幕中央，向右延展三节
start_x = WINDOW_WIDTH // 2
start_y = WINDOW_HEIGHT // 2
for i in range(snake_length):
    snake.append([
        start_x - i * BLOCK_SIZE,
        start_y
    ])
# 初始移动方向向右
snake_dir = 'RIGHT'

# 初始化食物的位置
# 生成食物，不与蛇身体重叠
while True:
    food_x = random.randrange(0, WINDOW_WIDTH, BLOCK_SIZE)
    food_y = random.randrange(0, WINDOW_HEIGHT, BLOCK_SIZE)
    if [food_x, food_y] not in snake:
        break
food_pos = [food_x, food_y]

# ---------- 游戏主循环，仅实现窗口渲染和蛇/食物绘制，与移动逻辑 -----------
running = True
while running:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            pygame.quit()
            sys.exit()
        # 此处暂不处理键盘事件（移动逻辑会下步实现）

    # 绘制黑色背景
    window.fill(BLACK)

    # 绘制蛇（绿色，每一节）
    for block in snake:
        pygame.draw.rect(window, GREEN, (block[0], block[1], BLOCK_SIZE, BLOCK_SIZE))
    # 绘制食物（红色方块）
    pygame.draw.rect(window, RED, (food_pos[0], food_pos[1], BLOCK_SIZE, BLOCK_SIZE))

    # 实现蛇的移动逻辑（不处理吃食物和碰撞，仅移动身体）
    if snake_dir == 'UP':
        new_head = [snake[0][0], snake[0][1] - BLOCK_SIZE]
    elif snake_dir == 'DOWN':
        new_head = [snake[0][0], snake[0][1] + BLOCK_SIZE]
    elif snake_dir == 'LEFT':
        new_head = [snake[0][0] - BLOCK_SIZE, snake[0][1]]
    elif snake_dir == 'RIGHT':
        new_head = [snake[0][0] + BLOCK_SIZE, snake[0][1]]
    # 插入新头部
    snake.insert(0, new_head)
    # 移除最后一节，保持蛇长度不变（吃食物和长度变化将后续实现）
    snake.pop()

    # 刷新窗口
    pygame.display.update()
    # 控制帧率
    clock.tick(SNAKE_SPEED)
