# 俄罗斯方块完整版实现：集成所有机制及额外功能
import pygame
import sys
import random

# ===============================
# Step 1: 导入PyGame及相关依赖
# ===============================
# 已导入

# ===============================
# Step 2: 初始化PyGame及创建游戏窗口
# ===============================
pygame.init()

# 游戏窗口参数
GRID_WIDTH = 10
GRID_HEIGHT = 20
CELL_SIZE = 30
WINDOW_WIDTH = GRID_WIDTH * CELL_SIZE
WINDOW_HEIGHT = GRID_HEIGHT * CELL_SIZE + 60  # 预留下方区域显示分数

screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
pygame.display.set_caption('俄罗斯方块')

font = pygame.font.SysFont('微软雅黑', 24)

# ===============================
# Step 4: 定义俄罗斯方块的形状和颜色
# ===============================
# 所有七种方块
SHAPES = [
    # I
    [[1, 1, 1, 1]],
    # O
    [[1, 1],
     [1, 1]],
    # S
    [[0, 1, 1],
     [1, 1, 0]],
    # Z
    [[1, 1, 0],
     [0, 1, 1]],
    # L
    [[1, 0, 0],
     [1, 1, 1]],
    # J
    [[0, 0, 1],
     [1, 1, 1]],
    # T
    [[0, 1, 0],
     [1, 1, 1]],
]
# 对应颜色
SHAPE_COLORS = [
    (0, 255, 255),      # I 蓝青
    (255, 255, 0),      # O 黄
    (0, 255, 0),        # S 绿
    (255, 0, 0),        # Z 红
    (255, 165, 0),      # L 橙
    (0, 0, 255),        # J 蓝
    (160, 32, 240)      # T 紫
]

# ===============================
# Step 5: 设计棋盘数据结构
# ===============================
# 20行10列, 初始全为空(None)
def create_board():
    return [[None for _ in range(GRID_WIDTH)] for _ in range(GRID_HEIGHT)]
board = create_board()

# ===============================
# 方块类
class Tetromino:
    def __init__(self, shape, color):
        self.shape = shape  # 2D数组
        self.color = color  # RGB色
        self.row = 0
        self.col = GRID_WIDTH // 2 - len(shape[0]) // 2  # 居中顶部

    def rotate(self):
        # 旋转90度 (顺时针)
        self.shape = [list(row) for row in zip(*self.shape[::-1])]

# ===============================
# Step 6: 实现方块生成与初始化
# ===============================
def spawn_new_tetromino():
    global current_tetromino, game_over
    shape_idx = random.randint(0, len(SHAPES)-1)
    shape = [list(row) for row in SHAPES[shape_idx]]
    color = SHAPE_COLORS[shape_idx]
    t = Tetromino(shape, color)
    # 判定game over
    if not can_move(t, t.row, t.col):
        game_over = True
        return
    current_tetromino = t

# ===============================
# Step 9: 实现方块旋转及旋转时的碰撞检测
# ===============================
def try_rotate():
    global current_tetromino
    ori_shape = [row[:] for row in current_tetromino.shape]
    current_tetromino.rotate()
    # 检查旋转后是否合法
    if not can_move(current_tetromino, current_tetromino.row, current_tetromino.col):
        current_tetromino.shape = ori_shape  # 还原

# ===============================
# Step 7 + 8: 下落、碰撞以及边界检测
# ===============================
def can_move(tetromino, new_row, new_col, shape=None):
    '''检查tetromino是否能移动到指定位置'''
    if shape is None:
        shape = tetromino.shape
    for i, row_block in enumerate(shape):
        for j, val in enumerate(row_block):
            if val:
                r = new_row + i
                c = new_col + j
                # 边界检测
                if r < 0 or r >= GRID_HEIGHT or c < 0 or c >= GRID_WIDTH:
                    return False
                # 落地检测
                if board[r][c] is not None:
                    return False
    return True


def try_move_left():
    global current_tetromino
    new_col = current_tetromino.col - 1
    if can_move(current_tetromino, current_tetromino.row, new_col):
        current_tetromino.col = new_col

def try_move_right():
    global current_tetromino
    new_col = current_tetromino.col + 1
    if can_move(current_tetromino, current_tetromino.row, new_col):
        current_tetromino.col = new_col

# 快速下落（一直到底）
def hard_drop():
    global current_tetromino
    while can_move(current_tetromino, current_tetromino.row+1, current_tetromino.col):
        current_tetromino.row += 1
    # 落地
    lock_tetromino_to_board(current_tetromino)
    spawn_new_tetromino()

# ===============================
# Step 11: 检测并消除完整的一行
# ===============================
def clear_lines_and_score():
    global board, score
    new_board = []
    cleared = 0
    for row in board:
        if all(cell is not None for cell in row):
            cleared += 1
            continue  # 不加入新棋盘，相当于消除了
        new_board.append(row)
    for _ in range(cleared):
        new_board.insert(0, [None] * GRID_WIDTH)
    board = new_board
    if cleared:
        score += {1: 100, 2: 300, 3: 700, 4: 1500}.get(cleared, cleared*500)

# ===============================
# Step 10: 将落地方块合并到棋盘
# ===============================
def lock_tetromino_to_board(tetromino):
    for i, row_block in enumerate(tetromino.shape):
        for j, val in enumerate(row_block):
            if val:
                r = tetromino.row + i
                c = tetromino.col + j
                if 0 <= r < GRID_HEIGHT and 0 <= c < GRID_WIDTH:
                    board[r][c] = tetromino.color
    clear_lines_and_score()

# ===============================
# Step 12: 分数更新与显示
# 已在clear_lines_and_score中处理

# ===============================
# Step 13: 判定游戏是否结束
# 已在spawn_new_tetromino中处理

def try_move_down():
    '''尝试让当前方块下落一格，遇到障碍则写入棋盘并刷新新方块'''
    global current_tetromino, game_over
    new_row = current_tetromino.row + 1
    new_col = current_tetromino.col
    if can_move(current_tetromino, new_row, new_col):
        current_tetromino.row = new_row
    else:
        lock_tetromino_to_board(current_tetromino)
        spawn_new_tetromino()

# ===============================
# Step 14: 实现重新开始的机制
# ===============================
def reset_game():
    global board, current_tetromino, game_over, score
    board = create_board()
    score = 0
    game_over = False
    spawn_new_tetromino()

# ===============================
# 游戏初版变量
current_tetromino = None
score = 0
next_tetromino = None
hold_tetromino = None
hold_used = False  # 是否hold过一次, 防止连续hold

game_over = False

# ===============================
# Step 7: 定时方块自动下落机制
# ===============================
drop_event = pygame.USEREVENT + 1
pygame.time.set_timer(drop_event, 500)  # 每500ms触发一次下落

reset_game()  # 游戏初始一次

# ===============================
# Step 3: 实现游戏主循环
#
# Step 17: 接收键盘输入控制方块
#
# (包含实时刷新)
# ===============================
running = True
clock = pygame.time.Clock()

while running:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
            break
        if event.type == drop_event and not game_over:
            try_move_down()
        if event.type == pygame.KEYDOWN:
            if game_over:
                if event.key in (pygame.K_r, pygame.K_SPACE):
                    reset_game()
                continue
            # 正常游戏时键盘事件
            if event.key == pygame.K_LEFT:
                try_move_left()
            elif event.key == pygame.K_RIGHT:
                try_move_right()
            elif event.key == pygame.K_UP:
                try_rotate()
            elif event.key == pygame.K_DOWN:
                try_move_down()
            elif event.key == pygame.K_SPACE:
                hard_drop()

    # ======================
    # Step 15: 绘制棋盘与彩色方块
    # ======================
    screen.fill((0, 0, 0))  # 黑色背景

    # 绘制棋盘背景格子（淡色线）
    for r in range(GRID_HEIGHT):
        for c in range(GRID_WIDTH):
            rect = pygame.Rect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE)
            pygame.draw.rect(screen, (30, 30, 30), rect, 1)

    # 绘制棋盘内部已固定的方块
    for r in range(GRID_HEIGHT):
        for c in range(GRID_WIDTH):
            color = board[r][c]
            if color:
                rect = pygame.Rect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE)
                pygame.draw.rect(screen, color, rect)
                pygame.draw.rect(screen, (40, 40, 40), rect, 1)  # 灰色边

    # 绘制当前下落的方块
    if current_tetromino and not game_over:
        for i, row_block in enumerate(current_tetromino.shape):
            for j, val in enumerate(row_block):
                if val:
                    r = current_tetromino.row + i
                    c = current_tetromino.col + j
                    if 0 <= r < GRID_HEIGHT and 0 <= c < GRID_WIDTH:
                        rect = pygame.Rect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE)
                        pygame.draw.rect(screen, current_tetromino.color, rect)
                        pygame.draw.rect(screen, (220, 220, 220), rect, 1)

    # ======================
    # Step 12: 分数与提示文字
    # ======================
    score_surface = font.render(f"分数: {score}", True, (255, 255, 255))
    screen.blit(score_surface, (10, GRID_HEIGHT * CELL_SIZE + 12))
    tip_surface = font.render("方向箭头控制，空格一键落底", True, (180, 170, 170))
    screen.blit(tip_surface, (180, GRID_HEIGHT * CELL_SIZE + 12))
    restart_surface = font.render("R/空格: 重新开始", True, (90, 190, 255))
    screen.blit(restart_surface, (10, GRID_HEIGHT * CELL_SIZE + 36))

    # ======================
    # Step 16: 游戏结束提示
    # ======================
    if game_over:
        over_surface = font.render("游戏结束! 按R或空格键重新开始", True, (255, 50, 50))
        rect = over_surface.get_rect(center=(WINDOW_WIDTH//2, WINDOW_HEIGHT//2))
        screen.blit(over_surface, rect)

    pygame.display.flip()  # 实时刷新界面  Step 16
    clock.tick(30)  # 30 FPS

pygame.quit()
sys.exit()
