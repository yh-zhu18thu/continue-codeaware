# s-1: 导入必要的 Python 包
import pygame  # 导入 PyGame 包，用于游戏相关操作
import sys     # 导入标准库 sys，用于退出游戏
import random  # s-7 & s-12 生成食物随机位置需要

# s-2: 初始化 PyGame
pygame.init()  # 初始化所有 PyGame 模块

# s-3: 设置游戏窗口参数并创建窗口
WINDOW_WIDTH = 640   # 窗口宽度
WINDOW_HEIGHT = 480  # 窗口高度
WINDOW_TITLE = "PyGame Example Game"  # 窗口标题
window = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))  # 创建窗口对象
pygame.display.set_caption(WINDOW_TITLE)  # 设置窗口标题

# s-4: 设置游戏时钟和帧率
clock = pygame.time.Clock()  # 创建时钟对象，用于控制帧率
FPS = 60  # 每秒帧数
SNAKE_SPEED = 10  # 每秒蛇更新多少次(例如10)，即蛇的移动速度
MOVE_INTERVAL = 1000 // SNAKE_SPEED  # 蛇每次移动间隔多少毫秒
last_move_time = pygame.time.get_ticks()  # 上次蛇移动的时间

# s-5: 定义颜色和必要的尺寸常量
WHITE = (255, 255, 255)  # 白色
BLACK = (0, 0, 0)        # 黑色
RED   = (255, 0, 0)      # 红色
GREEN = (0, 255, 0)      # 绿色
BLUE  = (0, 0, 255)      # 蓝色
GRID_SIZE = 20           # 单位方格像素尺寸

def get_random_food_position(snake):
    # s-12: 生成新的食物随机位置，确保不在蛇身体上
    while True:
        x = random.randint(0, (WINDOW_WIDTH - GRID_SIZE) // GRID_SIZE) * GRID_SIZE
        y = random.randint(0, (WINDOW_HEIGHT - GRID_SIZE) // GRID_SIZE) * GRID_SIZE
        if (x, y) not in snake:
            return (x, y)

# s-6: 初始化蛇的初始位置和身体数据结构
init_snake_length = 3
snake = []
start_x = WINDOW_WIDTH // 2 // GRID_SIZE * GRID_SIZE
start_y = WINDOW_HEIGHT // 2 // GRID_SIZE * GRID_SIZE
for i in range(init_snake_length):
    snake.append((start_x - i * GRID_SIZE, start_y))  # 向右延展

direction = 'RIGHT'          # 当前方向
change_to = direction        # 用于按键改变方向

def get_init_food_pos(snake):
    # s-7: 初始化食物的初始位置（避免与蛇重叠）
    return get_random_food_position(snake)

food_pos = get_init_food_pos(snake)

score = 0

game_over = False

def show_score(surface, score):
    # s-15: 绘制得分到游戏窗口
    font = pygame.font.SysFont('arial', 24)
    score_surf = font.render(f"Score: {score}", True, BLUE)
    surface.blit(score_surf, (10, 10))

while True:
    # s-16: 实现游戏结束提示与重新开始机制
    if game_over:
        window.fill(BLACK)
        font = pygame.font.SysFont('arial', 48)
        text = font.render("Game Over", True, RED)
        rect = text.get_rect(center=(WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2 - 40))
        window.blit(text, rect)
        font_small = pygame.font.SysFont('arial', 30)
        tip = font_small.render("Press ENTER to restart or ESC to quit", True, WHITE)
        rect_tip = tip.get_rect(center=(WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2 + 20))
        window.blit(tip, rect_tip)
        show_score(window, score)
        pygame.display.flip()
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_RETURN:
                    # 重新初始化游戏状态
                    snake = []
                    for i in range(init_snake_length):
                        snake.append((start_x - i * GRID_SIZE, start_y))
                    direction = 'RIGHT'
                    change_to = direction
                    food_pos = get_init_food_pos(snake)
                    score = 0
                    game_over = False
                    last_move_time = pygame.time.get_ticks()  # 重置移动时间
                elif event.key == pygame.K_ESCAPE:
                    pygame.quit()
                    sys.exit()
        continue  # 不处理后续逻辑

    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            pygame.quit()
            sys.exit()
        # s-9: 响应键盘方向键改变蛇的运动方向
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_UP and direction != 'DOWN':
                change_to = 'UP'
            elif event.key == pygame.K_DOWN and direction != 'UP':
                change_to = 'DOWN'
            elif event.key == pygame.K_LEFT and direction != 'RIGHT':
                change_to = 'LEFT'
            elif event.key == pygame.K_RIGHT and direction != 'LEFT':
                change_to = 'RIGHT'

    current_time = pygame.time.get_ticks()
    if current_time - last_move_time >= MOVE_INTERVAL:
        # s-10: 每MOVE_INTERVAL毫秒更新蛇的位置
        last_move_time = current_time
        direction = change_to
        head_x, head_y = snake[0]
        if direction == 'UP':
            new_head = (head_x, head_y - GRID_SIZE)
        elif direction == 'DOWN':
            new_head = (head_x, head_y + GRID_SIZE)
        elif direction == 'LEFT':
            new_head = (head_x - GRID_SIZE, head_y)
        elif direction == 'RIGHT':
            new_head = (head_x + GRID_SIZE, head_y)
        snake.insert(0, new_head)

        # s-11: 判断蛇是否吃到食物并处理增长
        if snake[0] == food_pos:
            score += 1
            # s-12: 生成新的食物随机位置
            food_pos = get_random_food_position(snake)
        else:
            snake.pop()  # 没吃到就变回原长度

        # s-13: 检测蛇头碰撞到边界
        head_x, head_y = snake[0]
        if head_x < 0 or head_x >= WINDOW_WIDTH or head_y < 0 or head_y >= WINDOW_HEIGHT:
            game_over = True
            continue

        # s-14: 检测蛇头碰撞自身身体
        if snake[0] in snake[1:]:
            game_over = True
            continue

    # s-8: 绘制蛇和食物到游戏画布
    window.fill(BLACK)
    for pos in snake:
        pygame.draw.rect(window, GREEN, (pos[0], pos[1], GRID_SIZE, GRID_SIZE))
    pygame.draw.rect(window, RED, (food_pos[0], food_pos[1], GRID_SIZE, GRID_SIZE))
    show_score(window, score)
    pygame.display.flip()

    clock.tick(FPS)
