import pygame  # 导入pygame库
import random # 导入random库用于生成随机数

# 初始化pygame
pygame.init()

# 设置游戏窗口尺寸和标题
WINDOW_WIDTH = 600
WINDOW_HEIGHT = 400
BLOCK_SIZE = 20  # 定义蛇和食物的方块大小
window = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))  # 创建窗口
pygame.display.set_caption("贪吃蛇游戏")  # 设置窗口标题

# 设置游戏时钟，控制FPS
clock = pygame.time.Clock()
FPS = 15  # 可根据需要调整蛇的速度

# 定义颜色，使用RGB格式
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
RED = (255, 0, 0)
GREEN = (0, 255, 0)
DARK_GREEN = (0, 155, 0)
GRAY = (200, 200, 200)  # 用于分隔线、界面装饰

# 初始化蛇、食物和分数所在的变量
def reset_game_state():
    # 重新初始化所有游戏数据
    global snake_pos, snake_body, snake_direction, change_to, food_pos, food_spawn, score, game_over
    snake_pos = [100, 60]
    snake_body = [
        [100, 60],
        [80, 60],
        [60, 60],
    ]
    snake_direction = 'RIGHT'
    change_to = snake_direction
    food_pos = [
        random.randrange(0, WINDOW_WIDTH // BLOCK_SIZE) * BLOCK_SIZE,
        random.randrange(0, WINDOW_HEIGHT // BLOCK_SIZE) * BLOCK_SIZE
    ]
    food_spawn = True
    score = 0
    game_over = False

reset_game_state()  # 游戏初始化

# 设置字体，实现美化和分数显示
score_font = pygame.font.SysFont('arial', 24, bold=True)
gameover_font = pygame.font.SysFont('arial', 48, bold=True)
hint_font = pygame.font.SysFont('arial', 28)

# 绘制游戏区域和蛇身体的函数,增加分隔线美化显示
def draw_game_area():
    window.fill(GRAY)  # 背景填充浅灰色更舒适
    # 绘制游戏区域白色
    pygame.draw.rect(window, WHITE, pygame.Rect(0, 0, WINDOW_WIDTH, WINDOW_HEIGHT))
    # 绘制分隔线（在顶端显示分数的区域）
    pygame.draw.line(window, GRAY, (0, 40), (WINDOW_WIDTH, 40), 3)
    for block in snake_body:
        pygame.draw.rect(window, DARK_GREEN, pygame.Rect(block[0], block[1], BLOCK_SIZE, BLOCK_SIZE))
    # 在此函数中只画蛇和背景，食物在其他函数里画

# 生成并绘制食物的函数
def spawn_food():
    global food_pos, food_spawn
    if not food_spawn:
        while True:
            new_food_pos = [
                random.randrange(0, WINDOW_WIDTH // BLOCK_SIZE) * BLOCK_SIZE,
                random.randrange(0, WINDOW_HEIGHT // BLOCK_SIZE) * BLOCK_SIZE
            ]
            # 保证食物不生成在蛇身体上
            if new_food_pos not in snake_body:
                food_pos = new_food_pos
                break
        food_spawn = True
    pygame.draw.rect(window, RED, pygame.Rect(food_pos[0], food_pos[1], BLOCK_SIZE, BLOCK_SIZE))

# 实现蛇的移动逻辑，这个函数只更新蛇的位置
# 注意: 这里只实现基本移动逻辑，未实现吃食物和死亡检测

def move_snake():
    global snake_pos, snake_body, snake_direction, change_to
    # 根据change_to改变当前方向
    if change_to == 'UP' and snake_direction != 'DOWN':
        snake_direction = 'UP'
    if change_to == 'DOWN' and snake_direction != 'UP':
        snake_direction = 'DOWN'
    if change_to == 'LEFT' and snake_direction != 'RIGHT':
        snake_direction = 'LEFT'
    if change_to == 'RIGHT' and snake_direction != 'LEFT':
        snake_direction = 'RIGHT'
    # 更新蛇头坐标
    if snake_direction == 'UP':
        snake_pos[1] -= BLOCK_SIZE
    elif snake_direction == 'DOWN':
        snake_pos[1] += BLOCK_SIZE
    elif snake_direction == 'LEFT':
        snake_pos[0] -= BLOCK_SIZE
    elif snake_direction == 'RIGHT':
        snake_pos[0] += BLOCK_SIZE
    # 在蛇头前插入新坐标，实现移动
    snake_body.insert(0, list(snake_pos))
    # pop由碰撞/吃食物逻辑决定

# 绘制分数,界面美化
def show_score():
    score_text = score_font.render(f"分数: {score}", True, BLACK)
    # 分数栏置顶居中
    text_rect = score_text.get_rect()
    text_rect.center = (WINDOW_WIDTH // 2, 20)
    window.blit(score_text, text_rect)

# 展示游戏结束提示信息，包含重新开始和退出提示
def show_gameover():
    go_text = gameover_font.render("Game Over", True, RED)
    hint_text = hint_font.render("按空格重新开始，Esc退出", True, BLACK)
    go_rect = go_text.get_rect(center=(WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2 - 40))
    hint_rect = hint_text.get_rect(center=(WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2 + 20))
    window.blit(go_text, go_rect)
    window.blit(hint_text, hint_rect)

# ------- 主循环与新功能集成 -------

game_over = False  # 游戏结束状态

while True:
    for event in pygame.event.get():
        # 处理窗口关闭事件
        if event.type == pygame.QUIT:
            pygame.quit()
            quit()
        # 监听键盘事件，游戏未结束时改变方向，结束时可重开或退出
        elif event.type == pygame.KEYDOWN:
            if not game_over:
                if event.key == pygame.K_UP or event.key == pygame.K_w:
                    if snake_direction != 'DOWN':
                        change_to = 'UP'
                elif event.key == pygame.K_DOWN or event.key == pygame.K_s:
                    if snake_direction != 'UP':
                        change_to = 'DOWN'
                elif event.key == pygame.K_LEFT or event.key == pygame.K_a:
                    if snake_direction != 'RIGHT':
                        change_to = 'LEFT'
                elif event.key == pygame.K_RIGHT or event.key == pygame.K_d:
                    if snake_direction != 'LEFT':
                        change_to = 'RIGHT'
            else:
                # Esc退出
                if event.key == pygame.K_ESCAPE:
                    pygame.quit()
                    quit()
                # 空格或回车重新开始游戏
                elif event.key == pygame.K_SPACE or event.key == pygame.K_RETURN:
                    reset_game_state()

    if not game_over:
        move_snake()  # 移动蛇

        # 检测蛇与食物碰撞
        if snake_pos[0] == food_pos[0] and snake_pos[1] == food_pos[1]:
            # 吃到食物则分数+1，不移除末尾，蛇变长
            score += 1
            food_spawn = False
        else:
            # 移除尾巴，不变长
            snake_body.pop()

        # 检测游戏结束条件（碰撞墙壁/自咬）
        # 与边界碰撞
        if (
            snake_pos[0] < 0 or snake_pos[0] >= WINDOW_WIDTH or
            snake_pos[1] < 0 or snake_pos[1] >= WINDOW_HEIGHT
        ):
            game_over = True
        # 与自身碰撞
        if snake_pos in snake_body[1:]:
            game_over = True

        # 绘制界面及食品和分数
        draw_game_area()
        spawn_food()
        show_score()
    else:
        # 显示Game Over提示,分数依然展示
        draw_game_area()
        spawn_food()
        show_score()
        show_gameover()

    pygame.display.update()
    clock.tick(FPS)
# 程序结束