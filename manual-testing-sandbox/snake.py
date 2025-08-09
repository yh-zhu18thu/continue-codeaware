import pygame
import sys
import random

pygame.init()

WINDOW_WIDTH = 600
WINDOW_HEIGHT = 400
WINDOW_SIZE = (WINDOW_WIDTH, WINDOW_HEIGHT)

BLACK = (0, 0, 0)
GREEN = (0, 255, 0)
RED   = (255, 0, 0)
WHITE = (255, 255, 255)

BLOCK_SIZE = 20

snake_body = [
    [100, 100],
    [80, 100],
    [60, 100],
]

def random_food_position():
    x = random.randint(0, (WINDOW_WIDTH - BLOCK_SIZE) // BLOCK_SIZE) * BLOCK_SIZE
    y = random.randint(0, (WINDOW_HEIGHT - BLOCK_SIZE) // BLOCK_SIZE) * BLOCK_SIZE
    return [x, y]

food_pos = random_food_position()
direction = 'RIGHT'
clock = pygame.time.Clock()

score = 0  # 新增分数变量

font = pygame.font.SysFont('Arial', 24)  # 新增字体

screen = pygame.display.set_mode(WINDOW_SIZE)
pygame.display.set_caption('贪吃蛇 Snake Game')

while True:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            pygame.quit()
            sys.exit()
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_UP and direction != 'DOWN':
                direction = 'UP'
            elif event.key == pygame.K_DOWN and direction != 'UP':
                direction = 'DOWN'
            elif event.key == pygame.K_LEFT and direction != 'RIGHT':
                direction = 'LEFT'
            elif event.key == pygame.K_RIGHT and direction != 'LEFT':
                direction = 'RIGHT'

    head_x, head_y = snake_body[0]
    if direction == 'RIGHT':
        new_head = [head_x + BLOCK_SIZE, head_y]
    elif direction == 'LEFT':
        new_head = [head_x - BLOCK_SIZE, head_y]
    elif direction == 'UP':
        new_head = [head_x, head_y - BLOCK_SIZE]
    elif direction == 'DOWN':
        new_head = [head_x, head_y + BLOCK_SIZE]

    # 检查死亡：碰墙
    if (
        new_head[0] < 0 or new_head[0] >= WINDOW_WIDTH
        or new_head[1] < 0 or new_head[1] >= WINDOW_HEIGHT
    ):
        print("撞墙 Game Over! 得分：", score)
        pygame.quit()
        sys.exit()

    # 检查死亡：撞自己
    if new_head in snake_body:
        print("咬到自己 Game Over! 得分：", score)
        pygame.quit()
        sys.exit()

    snake_body.insert(0, new_head)

    # 新增：判断是否吃到食物 及加分
    if new_head == food_pos:
        food_pos = random_food_position()  # 吃掉就重生食物
        score += 1                         # 新增分数加一
    else:
        snake_body.pop()

    screen.fill(BLACK)

    for block in snake_body:
        pygame.draw.rect(screen, GREEN, pygame.Rect(block[0], block[1], BLOCK_SIZE, BLOCK_SIZE))

    pygame.draw.rect(screen, RED, pygame.Rect(food_pos[0], food_pos[1], BLOCK_SIZE, BLOCK_SIZE))

    # 新增：显示分数
    score_surface = font.render(f"Score: {score}", True, WHITE)
    screen.blit(score_surface, (10, 10))

    pygame.display.update()
    clock.tick(10)