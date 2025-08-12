import pygame
import sys
import random

# --- 步骤 s-2: 初始化PyGame并设置基础参数 ---
pygame.init()

# 游戏相关参数
GRID_WIDTH = 10    # 网格宽度（列数）
GRID_HEIGHT = 20   # 网格高度（行数）
GRID_SIZE = 30     # 单格像素尺寸
WINDOW_WIDTH = GRID_WIDTH * GRID_SIZE
WINDOW_HEIGHT = GRID_HEIGHT * GRID_SIZE + 80  # 顶部预留区域用于得分显示等

# 颜色常量定义
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
GRAY = (180, 180, 180)
RED = (255, 0, 0)
GREEN = (0, 255, 0)
BLUE = (0, 0, 255)
CYAN = (0, 255, 255)
MAGENTA = (255, 0, 255)
ORANGE = (255, 165, 0)
YELLOW = (255, 255, 0)
DARK_GRAY = (50, 50, 50)

# 俄罗斯方块全部形状定义（4x4矩阵表达）
TETROMINO_SHAPES = [
    # I
    [[
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
    ]],
    # O
    [[
        [0, 0, 0, 0],
        [0, 1, 1, 0],
        [0, 1, 1, 0],
        [0, 0, 0, 0]
    ]],
    # T
    [[
        [0, 0, 0, 0],
        [1, 1, 1, 0],
        [0, 1, 0, 0],
        [0, 0, 0, 0]
    ]],
    # S
    [[
        [0, 0, 0, 0],
        [0, 1, 1, 0],
        [1, 1, 0, 0],
        [0, 0, 0, 0]
    ]],
    # Z
    [[
        [0, 0, 0, 0],
        [1, 1, 0, 0],
        [0, 1, 1, 0],
        [0, 0, 0, 0]
    ]],
    # J
    [[
        [0, 0, 0, 0],
        [1, 0, 0, 0],
        [1, 1, 1, 0],
        [0, 0, 0, 0]
    ]],
    # L
    [[
        [0, 0, 0, 0],
        [0, 0, 1, 0],
        [1, 1, 1, 0],
        [0, 0, 0, 0]
    ]]
]

TETROMINO_COLORS = [CYAN, YELLOW, MAGENTA, GREEN, RED, BLUE, ORANGE]  # I O T S Z J L

# --- 步骤 s-6: 方块生成及初始定位 ---
class Tetromino:
    def __init__(self, shape, color):
        self.shape = [row[:] for row in shape]  # 方块矩阵（深拷贝）
        self.color = color
        # 出现在屏幕顶部中间
        self.row = 0
        self.col = GRID_WIDTH // 2 - 2  # 保证4x4主体居中
    def rotate(self):
        # 顺时针旋转
        self.shape = [list(row) for row in zip(*self.shape[::-1])]
    def get_coords(self):
        # 返回方块所有被占用格的(row,col)
        coords = []
        for r in range(4):
            for c in range(4):
                if self.shape[r][c]:
                    coords.append((self.row + r, self.col + c))
        return coords

def spawn_tetromino():
    idx = random.randrange(len(TETROMINO_SHAPES))
    shape = TETROMINO_SHAPES[idx][0]
    color = TETROMINO_COLORS[idx]
    return Tetromino(shape, color)

# --- 步骤 s-9: 绘制网格与外框 ---
def draw_grid(surface):
    # 外框
    pygame.draw.rect(surface, BLACK, (0, 0, GRID_WIDTH * GRID_SIZE, GRID_HEIGHT * GRID_SIZE), 3)
    # 竖线
    for c in range(GRID_WIDTH+1):
        x = c * GRID_SIZE
        pygame.draw.line(surface, GRAY, (x, 0), (x, GRID_HEIGHT * GRID_SIZE))
    # 横线
    for r in range(GRID_HEIGHT+1):
        y = r * GRID_SIZE
        pygame.draw.line(surface, GRAY, (0, y), (GRID_WIDTH * GRID_SIZE, y))

# --- 步骤 s-10: 渲染已落地方块并保持颜色 ---
def draw_locked_blocks(surface):
    for r in range(GRID_HEIGHT):
        for c in range(GRID_WIDTH):
            color = grid[r][c]
            if color:
                rect = pygame.Rect(c*GRID_SIZE, r*GRID_SIZE, GRID_SIZE, GRID_SIZE)
                pygame.draw.rect(surface, color, rect)
                pygame.draw.rect(surface, GRAY, rect, 1)

# --- 步骤 s-11: 绘制下落中的方块 ---
def draw_current_tetromino(surface, tetromino):
    for r in range(4):
        for c in range(4):
            if tetromino.shape[r][c]:
                grid_r = tetromino.row + r
                grid_c = tetromino.col + c
                if 0 <= grid_r < GRID_HEIGHT and 0 <= grid_c < GRID_WIDTH:
                    x = grid_c * GRID_SIZE
                    y = grid_r * GRID_SIZE
                    rect = pygame.Rect(x, y, GRID_SIZE, GRID_SIZE)
                    pygame.draw.rect(surface, tetromino.color, rect)
                    pygame.draw.rect(surface, GRAY, rect, 1)

# --- 辅助功能: 检测是否能放置方块于给定位移下 ---
def is_valid_position(tetromino, dx=0, dy=0, test_shape=None):
    test_shape = test_shape if test_shape else tetromino.shape
    for r in range(4):
        for c in range(4):
            if test_shape[r][c]:
                new_r = tetromino.row + r + dy
                new_c = tetromino.col + c + dx
                if new_r < 0 or new_r >= GRID_HEIGHT or new_c < 0 or new_c >= GRID_WIDTH:
                    return False
                if grid[new_r][new_c]:
                    return False
    return True

# --- 步骤 s-7 & s-8: 方块移动、旋转与碰撞检测 ---
def move_tetromino(tetromino, dx=0, dy=0):
    if is_valid_position(tetromino, dx=dx, dy=dy):
        tetromino.col += dx
        tetromino.row += dy
        return True
    return False

def rotate_tetromino(tetromino):
    old_shape = [row[:] for row in tetromino.shape]
    tetromino.rotate()
    if not is_valid_position(tetromino):
        # 干涉, 恢复
        tetromino.shape = old_shape
        return False
    return True

# --- 步骤 s-8: 方块落地、网格占位 ---
def place_tetromino_to_grid(tetromino):
    for r in range(4):
        for c in range(4):
            if tetromino.shape[r][c]:
                gr = tetromino.row + r
                gc = tetromino.col + c
                if 0 <= gr < GRID_HEIGHT and 0 <= gc < GRID_WIDTH:
                    grid[gr][gc] = tetromino.color

# --- 步骤 s-14: 满行检测与消除功能 ---
def clear_full_lines():
    global grid, score
    new_grid = [row[:] for row in grid]
    lines_cleared = 0
    for row in range(GRID_HEIGHT-1, -1, -1):
        if all(new_grid[row]):  # 该行全部被填满
            del new_grid[row]
            new_grid = [[None for _ in range(GRID_WIDTH)]] + new_grid
            lines_cleared += 1
    grid = [row[:] for row in new_grid]
    if lines_cleared > 0:
        # --- 步骤 s-15: 消除得分累计 ---
        score += lines_cleared * 100

# --- 步骤 s-15: 渲染实时分数区域 ---
def draw_score(surface):
    font = pygame.font.SysFont(None, 36)
    score_surf = font.render(f'分数: {score}', True, BLUE)
    surface.blit(score_surf, (10, GRID_HEIGHT * GRID_SIZE + 15))

# --- s-16: 游戏结束检测与提示 ---
def is_game_over():
    # 顶部出现颜色就是over
    for c in range(GRID_WIDTH):
        if grid[0][c] is not None:
            return True
    return False

def draw_game_over(surface):
    font = pygame.font.SysFont(None, 54)
    over_surf = font.render('Game Over', True, RED)
    rect = over_surf.get_rect(center=(WINDOW_WIDTH//2, WINDOW_HEIGHT//2 - 40))
    surface.blit(over_surf, rect)
    font2 = pygame.font.SysFont(None, 30)
    hint = font2.render('按R键重新开始', True, DARK_GRAY)
    rect2 = hint.get_rect(center=(WINDOW_WIDTH//2, WINDOW_HEIGHT//2 + 10))
    surface.blit(hint, rect2)

# --- s-13: 加速下落与一键到底功能 ---
def drop_tetromino_to_bottom(tetromino):
    # 持续下移直到落地
    while move_tetromino(tetromino, dx=0, dy=1):
        pass

# --- 步骤 s-12 & s-13: 处理键盘事件实现玩家控制 ---
def handle_user_input(tetromino):
    global drop_timer
    keys = pygame.key.get_pressed()
    # 水平移动加延迟处理，使持续按键不卡顿
    global move_left_press, move_right_press, soft_drop_press, move_cooldown
    pressed = False
    if keys[pygame.K_LEFT]:
        if not move_left_press or pygame.time.get_ticks() - move_left_press > move_cooldown:
            if move_tetromino(tetromino, dx=-1):
                pressed = True
            move_left_press = pygame.time.get_ticks()
    else:
        move_left_press = 0
    if keys[pygame.K_RIGHT]:
        if not move_right_press or pygame.time.get_ticks() - move_right_press > move_cooldown:
            if move_tetromino(tetromino, dx=1):
                pressed = True
            move_right_press = pygame.time.get_ticks()
    else:
        move_right_press = 0
    if keys[pygame.K_DOWN]:
        if not soft_drop_press or pygame.time.get_ticks() - soft_drop_press > 30:
            if move_tetromino(tetromino, dx=0, dy=1):
                drop_timer = 0  # 软降计时器重置
                pressed = True
            soft_drop_press = pygame.time.get_ticks()
    else:
        soft_drop_press = 0
    if keys[pygame.K_UP]:
        rotate_tetromino(tetromino)
    if keys[pygame.K_SPACE]:
        drop_tetromino_to_bottom(tetromino)
        drop_timer = DROP_INTERVAL  # 保证落地
    # 防止持续触发旋转/空格(硬降)
    global last_space
    if keys[pygame.K_SPACE]:
        if not last_space:
            drop_tetromino_to_bottom(tetromino)
            drop_timer = DROP_INTERVAL  # 马上落地
            last_space = True
    else:
        last_space = False
    global last_up
    if keys[pygame.K_UP]:
        if not last_up:
            rotate_tetromino(tetromino)
            last_up = True
    else:
        last_up = False

# --- s-17: 游戏重启功能 ---
def restart_game():
    global grid, current_tetromino, next_tetromino, score, running, game_over
    grid = [[None for _ in range(GRID_WIDTH)] for _ in range(GRID_HEIGHT)]
    current_tetromino = spawn_tetromino()
    next_tetromino = spawn_tetromino()
    score = 0
    running = True
    game_over = False

# -- 游戏状态全局变量定义 --
grid = [[None for _ in range(GRID_WIDTH)] for _ in range(GRID_HEIGHT)]  # 所有静止方块颜色
current_tetromino = spawn_tetromino()
next_tetromino = spawn_tetromino()
score = 0

# -- 键盘连发辅助变量 --
move_left_press = 0
move_right_press = 0
soft_drop_press = 0
move_cooldown = 80  # 毫秒
last_space = False
last_up = False

# --- 主时钟对象，用于控制主循环帧率 ---
clock = pygame.time.Clock()
FPS = 60  # 帧率

drop_timer = 0  # 方块下落计数器
DROP_INTERVAL = 30  # 自然下落

game_over = False
running = True  # 主循环标志

# --- 创建窗口与标题 ---
screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
pygame.display.set_caption("俄罗斯方块")

# ---- 主游戏循环 ----
while True:
    clock.tick(FPS)  # 帧率
    # --- 事件循环 ---
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            pygame.quit()
            sys.exit()
        # --- s-17: 处理重启按键 ---
        if event.type == pygame.KEYDOWN and game_over:
            if event.key == pygame.K_r:
                restart_game()
    # --- 背景 ---
    screen.fill(WHITE)
    # --- 渲染区域 ---
    draw_grid(screen)
    draw_locked_blocks(screen)
    draw_current_tetromino(screen, current_tetromino)
    draw_score(screen)

    # --- 处理键盘控制 ---
    if not game_over:
        handle_user_input(current_tetromino)
        # 方块自然下落
        drop_timer += 1
        fast_drop = pygame.key.get_pressed()[pygame.K_DOWN]
        effective_interval = 2 if fast_drop else DROP_INTERVAL
        if drop_timer >= effective_interval:
            if not move_tetromino(current_tetromino, dx=0, dy=1):
                # 落地: 静止
                place_tetromino_to_grid(current_tetromino)
                clear_full_lines()  # 消行检测与落色
                # 新方块生成
                current_tetromino = next_tetromino
                next_tetromino = spawn_tetromino()
                # s-16: Game Over检测
                if not is_valid_position(current_tetromino):
                    game_over = True
            drop_timer = 0
    else:
        draw_game_over(screen)
    pygame.display.flip()
