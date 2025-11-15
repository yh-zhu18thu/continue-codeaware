import pygame

# 初始化pygame
pygame.init()

# 设置窗口大小与标题
screen = pygame.display.set_mode((600, 400))  # 修改窗口尺寸以符合新需求
pygame.display.set_caption('Basic Game Window Test')  # 修改标题

# 定义颜色常量
LIGHT_BLUE = (173, 216, 230)
BLACK = (0, 0, 0)
RED = (255, 0, 0)

# 主游戏循环变量
running = True

# 初始化蛇的位置、长度、方向
snake_pos = [(300, 200), (290, 200), (280, 200)]  # 初始蛇由3个方块组成
snake_dir = 'RIGHT'  # 初始移动方向为向右
block_size = 10  # 每个蛇块的大小

while running:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        # 检测键盘输入以改变蛇的方向
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_UP and snake_dir != 'DOWN':
                snake_dir = 'UP'
            elif event.key == pygame.K_DOWN and snake_dir != 'UP':
                snake_dir = 'DOWN'
            elif event.key == pygame.K_LEFT and snake_dir != 'RIGHT':
                snake_dir = 'LEFT'
            elif event.key == pygame.K_RIGHT and snake_dir != 'LEFT':
                snake_dir = 'RIGHT'

    # 根据当前移动方向更新蛇的位置
    head_x, head_y = snake_pos[0]
    if snake_dir == 'UP':
        new_head = (head_x, head_y - block_size)
    elif snake_dir == 'DOWN':
        new_head = (head_x, head_y + block_size)
    elif snake_dir == 'LEFT':
        new_head = (head_x - block_size, head_y)
    elif snake_dir == 'RIGHT':
        new_head = (head_x + block_size, head_y)

    # 在蛇的头部添加新位置，保持移动
    snake_pos = [new_head] + snake_pos[:-1]

    # 设置背景颜色为浅蓝色，更适合游戏骨架背景
    screen.fill(LIGHT_BLUE)

    # 绘制简单的线条和颜色框架，为游戏界面提供基本骨架
    pygame.draw.line(screen, BLACK, (100, 100), (500, 100), 2)  # 水平黑色线条
    pygame.draw.line(screen, BLACK, (100, 100), (100, 300), 2)  # 垂直黑色线条
    pygame.draw.rect(screen, RED, (250, 150, 100, 50), 2)       # 红色矩形框

    # 绘制蛇的每一部分
    for block in snake_pos:
        pygame.draw.rect(screen, BLACK, pygame.Rect(block[0], block[1], block_size, block_size))

    # 刷新显示内容
    pygame.display.flip()

# 退出pygame
pygame.quit()