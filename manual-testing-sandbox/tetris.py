# =================== s-1: 导入PyGame与random ===================
import pygame
import random

# =================== s-7: 定义方块与形状的数据结构 ===================
class Tetromino:
    def __init__(self, shape_variants, color, pos=(3, 0)):
        self.shape_variants = shape_variants  # 所有旋转形态
        self.variant_index = 0                # 当前旋转形态索引
        self.color = color                    # 当前方块颜色
        self.pos = [pos[0], pos[1]]           # 左上角实际位置 (以网格坐标计)

    def get_shape(self):
        return self.shape_variants[self.variant_index]
    def rotate(self):
        self.variant_index = (self.variant_index + 1) % len(self.shape_variants)
    def rotate_back(self):
        self.variant_index = (self.variant_index - 1) % len(self.shape_variants)

# 俄罗斯方块七种形状及所有旋转形态(每个形状以二维数组描述，1为占用)
# 注意: 每种形状都至少有1组形态 (有的有4组，对称的2组/I形状2组等)
SHAPES = [
    # I 型
    (
        [
            [[1, 1, 1, 1]],
            [[1], [1], [1], [1]],
        ],
        CYAN,
    ),
    # O 型
    (
        [
            [[1, 1], [1, 1]]
        ],
        YELLOW,
    ),
    # T 型
    (
        [
            [[0, 1, 0], [1, 1, 1]],
            [[1, 0], [1, 1], [1, 0]],
            [[1, 1, 1], [0, 1, 0]],
            [[0, 1], [1, 1], [0, 1]],
        ],
        MAGENTA,
    ),
    # S 型
    (
        [
            [[0, 1, 1], [1, 1, 0]],
            [[1, 0], [1, 1], [0, 1]],
        ],
        GREEN,
    ),
    # Z 型
    (
        [
            [[1, 1, 0], [0, 1, 1]],
            [[0, 1], [1, 1], [1, 0]],
        ],
        RED,
    ),
    # J 型
    (
        [
            [[1, 0, 0], [1, 1, 1]],
            [[1, 1], [1, 0], [1, 0]],
            [[1, 1, 1], [0, 0, 1]],
            [[0, 1], [0, 1], [1, 1]],
        ],
        BLUE,
    ),
    # L 型
    (
        [
            [[0, 0, 1], [1, 1, 1]],
            [[1, 0], [1, 0], [1, 1]],
            [[1, 1, 1], [1, 0, 0]],
            [[1, 1], [0, 1], [0, 1]],
        ],
        ORANGE,
    )
]

def spawn_new_tetromino():
    """
    随机生成新的俄罗斯方块。
    """
    shape_variants, color = random.choice(SHAPES)
    # 初始位置在网格顶部中央偏右一点
    return Tetromino(shape_variants, color, pos=(3, 0))

# 初始化PyGame (对应s-2)
pygame.init()

# 设置游戏窗口参数 (对应s-3)
WINDOW_WIDTH = 400
WINDOW_HEIGHT = 600
WINDOW_SIZE = (WINDOW_WIDTH, WINDOW_HEIGHT)
FPS = 30  # 游戏帧率

window = pygame.display.set_mode(WINDOW_SIZE)  # 创建主窗口
pygame.display.set_caption("俄罗斯方块 - PyGame版")  # 设置窗口标题
clock = pygame.time.Clock()  # 创建时钟对象用于控制帧率

# 定义颜色及全局常量 (对应s-4)
# 颜色常量 (RGB)
BLACK   = (0, 0, 0)
WHITE   = (255, 255, 255)
GRAY    = (128, 128, 128)
RED     = (255, 0, 0)
GREEN   = (0, 255, 0)
BLUE    = (0, 0, 255)
CYAN    = (0, 255, 255)
MAGENTA = (255, 0, 255)
YELLOW  = (255, 255, 0)
ORANGE  = (255, 165, 0)

# 每个方块格子的像素大小
BLOCK_SIZE = 30

# 网格宽高（单位为格子数）
GRID_COLS = 10  # 宽度为10格
GRID_ROWS = 20  # 高度为20格

# 绘制游戏网格函数 (对应s-5)
def draw_grid(surface):
    """
    在给定窗口Surface上绘制俄罗斯方块网格。
    """
    # 绘制竖线
    for col in range(GRID_COLS + 1):
        x = col * BLOCK_SIZE
        pygame.draw.line(surface, GRAY, (x, 0), (x, GRID_ROWS * BLOCK_SIZE))
    # 绘制横线
    for row in range(GRID_ROWS + 1):
        y = row * BLOCK_SIZE
        pygame.draw.line(surface, GRAY, (0, y), (GRID_COLS * BLOCK_SIZE, y))

# 简单的已固定方块和当前方块结构 (示例；正式游戏主循环会负责更新)
locked_grid = [[None for _ in range(GRID_COLS)] for _ in range(GRID_ROWS)]  # 每一格None或颜色

# 用新的生成函数初始化方块 (对应s-8)
current_tetromino = spawn_new_tetromino()

# =================== s-15: 分数管理与更新显示 ===================
score = 0  # 当前分数
SCORE_PER_LINE = 100  # 每消除一行加分
# (如有升级功能, 可在后续完善)

# 绘制当前方块与已固定方块函数 (对应s-6)
def draw_blocks(surface, locked_grid, tetromino):
    """
    绘制当前下落的俄罗斯方块及已固定/堆积方块。
    locked_grid: 20x10二维数组, 每格None或颜色
    tetromino: Tetromino类对象
    """
    # 先绘制已固定方块
    for row in range(GRID_ROWS):
        for col in range(GRID_COLS):
            cell_color = locked_grid[row][col]
            if cell_color:
                pygame.draw.rect(
                    surface, cell_color,
                    (col*BLOCK_SIZE, row*BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE)
                )
    # 绘制当前俄罗斯方块
    if tetromino is not None:
        shape = tetromino.get_shape()
        for r, row_shape in enumerate(shape):
            for c, value in enumerate(row_shape):
                if value:
                    draw_x = (tetromino.pos[0] + c) * BLOCK_SIZE
                    draw_y = (tetromino.pos[1] + r) * BLOCK_SIZE
                    pygame.draw.rect(
                        surface, tetromino.color,
                        (draw_x, draw_y, BLOCK_SIZE, BLOCK_SIZE)
                    )

# =================== 方块移动合法判断与移动逻辑 (对应s-9) ===================
def is_valid_move(tetromino, locked_grid, dx, dy):
    """
    检查当前方块尝试在网格上移动 (dx, dy) 是否合法，不越界，不碰撞。
    返回True合法, False不合法。
    """
    shape = tetromino.get_shape()
    for r, row_shape in enumerate(shape):
        for c, value in enumerate(row_shape):
            if value:
                new_x = tetromino.pos[0] + c + dx
                new_y = tetromino.pos[1] + r + dy
                # 检查是否超出左右、下边界
                if new_x < 0 or new_x >= GRID_COLS:
                    return False
                if new_y < 0 or new_y >= GRID_ROWS:
                    return False
                # 检查是否与已固定方块冲突
                if locked_grid[new_y][new_x]:
                    return False
    return True

def move_tetromino(tetromino, locked_grid, dx, dy):
    """
    如果可以合法移动，则更新当前方块位置。
    """
    if is_valid_move(tetromino, locked_grid, dx, dy):
        tetromino.pos[0] += dx
        tetromino.pos[1] += dy
        return True
    return False

# =================== s-10: 实现方块的旋转 ===================
def is_valid_rotation(tetromino, locked_grid):
    """
    检查当前方块在尝试旋转后的位置是否合法（不越界，不冲突）。
    返回True合法，False不合法。
    """
    tetromino.rotate()
    shape = tetromino.get_shape()
    valid = True
    for r, row_shape in enumerate(shape):
        for c, value in enumerate(row_shape):
            if value:
                new_x = tetromino.pos[0] + c
                new_y = tetromino.pos[1] + r
                if new_x < 0 or new_x >= GRID_COLS or new_y < 0 or new_y >= GRID_ROWS:
                    valid = False
                    break
                if locked_grid[new_y][new_x]:
                    valid = False
                    break
        if not valid:
            break
    tetromino.rotate_back()
    return valid

def rotate_tetromino_if_possible(tetromino, locked_grid):
    """
    如果方块旋转后合法，则执行旋转，否则不变。
    """
    if is_valid_rotation(tetromino, locked_grid):
        tetromino.rotate()
        return True
    return False

# ============= s-11: 处理方块下落与碰撞检测 =============
FALL_EVENT = pygame.USEREVENT + 1  # 自定义事件类型
FALL_INTERVAL = 500  # 500毫秒自动下落一次
pygame.time.set_timer(FALL_EVENT, FALL_INTERVAL)

def fix_tetromino_to_grid(tetromino, locked_grid):
    """
    将落到底的方块固定到locked_grid。
    """
    shape = tetromino.get_shape()
    for r, row_shape in enumerate(shape):
        for c, value in enumerate(row_shape):
            if value:
                grid_x = tetromino.pos[0] + c
                grid_y = tetromino.pos[1] + r
                if 0 <= grid_y < GRID_ROWS and 0 <= grid_x < GRID_COLS:
                    locked_grid[grid_y][grid_x] = tetromino.color

# =================== s-14: 检测并消除整行 ===================
def clear_full_lines(locked_grid):
    """
    检测locked_grid每一行，如果有整行被填满，则消除并返回消除行数。
    下移上方方块。
    """
    lines_cleared = 0
    # 自下向上检查
    new_grid = []  # 存储保留的行
    for row in locked_grid:
        if all(cell is not None for cell in row):
            lines_cleared += 1  # 行满
        else:
            new_grid.append(row)
    # 在顶部插入空行
    for _ in range(lines_cleared):
        new_grid.insert(0, [None for _ in range(GRID_COLS)])
    # 替换locked_grid的内容
    for y in range(GRID_ROWS):
        locked_grid[y][:] = new_grid[y]
    return lines_cleared

# =================== s-16: 游戏结束检测 ===================
def is_game_over(locked_grid):
    """
    判断顶端是否已被占用，若顶端一行有非None则游戏结束。
    """
    return any(cell is not None for cell in locked_grid[0])

# =================== s-17: 设计开始、暂停和结束界面 ===================
GAME_STATE_START = 0
GAME_STATE_RUNNING = 1
GAME_STATE_PAUSE = 2
GAME_STATE_OVER = 3

game_state = GAME_STATE_START  # 初始为开始界面

# =================== s-13: 生成新方块 ===================
def try_spawn_new_tetromino():
    '''
    生成新方块，如果顶部已被占用则触发游戏结束。
    '''
    global current_tetromino, game_state
    new_tetromino = spawn_new_tetromino()
    # 新方块投影到locked_grid检查合法性（不被顶端占满）
    can_spawn = True
    shape = new_tetromino.get_shape()
    for r, row_shape in enumerate(shape):
        for c, value in enumerate(row_shape):
            if value:
                grid_x = new_tetromino.pos[0] + c
                grid_y = new_tetromino.pos[1] + r
                if grid_y < 0 or grid_y >= GRID_ROWS or grid_x < 0 or grid_x >= GRID_COLS:
                    can_spawn = False
                    break
                if locked_grid[grid_y][grid_x]:
                    can_spawn = False
                    break
        if not can_spawn:
            break
    if can_spawn:
        current_tetromino = new_tetromino
    else:
        game_state = GAME_STATE_OVER
        current_tetromino = None

# 游戏主循环
running = True
while running:
    # 事件监控与按键响应
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        
        # =================== s-17: 游戏主菜单界面/暂停/游戏结束界面控制 ===================
        if game_state == GAME_STATE_START:
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_RETURN:
                    # 开始游戏
                    locked_grid = [[None for _ in range(GRID_COLS)] for _ in range(GRID_ROWS)]
                    score = 0
                    try_spawn_new_tetromino()
                    game_state = GAME_STATE_RUNNING
        elif game_state == GAME_STATE_OVER:
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_RETURN:
                    # 重新开始
                    locked_grid = [[None for _ in range(GRID_COLS)] for _ in range(GRID_ROWS)]
                    score = 0
                    try_spawn_new_tetromino()
                    game_state = GAME_STATE_RUNNING
        elif game_state == GAME_STATE_RUNNING:
            if event.type == pygame.KEYDOWN:
                # 暂停/继续
                if event.key == pygame.K_SPACE:
                    game_state = GAME_STATE_PAUSE
                elif current_tetromino:
                    if event.key == pygame.K_LEFT:
                        move_tetromino(current_tetromino, locked_grid, -1, 0)  # 向左
                    elif event.key == pygame.K_RIGHT:
                        move_tetromino(current_tetromino, locked_grid, 1, 0)   # 向右
                    elif event.key == pygame.K_DOWN:
                        # 尝试向下加速移动
                        if not move_tetromino(current_tetromino, locked_grid, 0, 1):
                            # 不能再下落则固定
                            fix_tetromino_to_grid(current_tetromino, locked_grid)
                            # s-14 检测并消除整行
                            lines = clear_full_lines(locked_grid)
                            if lines:
                                score += SCORE_PER_LINE * lines
                            try_spawn_new_tetromino()
                    elif event.key == pygame.K_UP:
                        rotate_tetromino_if_possible(current_tetromino, locked_grid)
            elif event.type == FALL_EVENT:
                # 下落
                if current_tetromino:
                    if not move_tetromino(current_tetromino, locked_grid, 0, 1):
                        fix_tetromino_to_grid(current_tetromino, locked_grid)
                        # s-14 检测并消除整行
                        lines = clear_full_lines(locked_grid)
                        if lines:
                            score += SCORE_PER_LINE * lines
                        try_spawn_new_tetromino()
        elif game_state == GAME_STATE_PAUSE:
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_SPACE:
                    game_state = GAME_STATE_RUNNING

    # 游戏结束检测（确保若堆满及时切换状态）
    if game_state == GAME_STATE_RUNNING and is_game_over(locked_grid):
        game_state = GAME_STATE_OVER
        current_tetromino = None

    # ========== 界面绘制 ==========
    window.fill(BLACK)
    
    # s-17: 开始菜单界面
    if game_state == GAME_STATE_START:
        font = pygame.font.SysFont(None, 48)
        text = font.render("俄罗斯方块", True, (255, 255, 255))
        rect = text.get_rect(center=(WINDOW_WIDTH//2, WINDOW_HEIGHT//2-50))
        window.blit(text, rect)
        font2 = pygame.font.SysFont(None, 32)
        instr = font2.render("按 Enter 键开始", True, (200, 200, 200))
        rect2 = instr.get_rect(center=(WINDOW_WIDTH//2, WINDOW_HEIGHT//2 + 20))
        window.blit(instr, rect2)
    elif game_state == GAME_STATE_OVER:
        font = pygame.font.SysFont(None, 48)
        text = font.render("游戏结束", True, (255, 0, 0))
        rect = text.get_rect(center=(WINDOW_WIDTH//2, WINDOW_HEIGHT//2-30))
        window.blit(text, rect)
        score_font = pygame.font.SysFont(None, 32)
        score_text = score_font.render(f"得分: {score}", True, (255, 255, 255))
        score_rect = score_text.get_rect(center=(WINDOW_WIDTH//2, WINDOW_HEIGHT//2+20))
        window.blit(score_text, score_rect)
        again = score_font.render("按 Enter 重玩", True, (200, 200, 200))
        again_rect = again.get_rect(center=(WINDOW_WIDTH//2, WINDOW_HEIGHT//2+60))
        window.blit(again, again_rect)
    else:
        # 游戏主界面 or 暂停
        draw_grid(window)
        draw_blocks(window, locked_grid, current_tetromino)
        # s-15 实时显示分数栏
        font = pygame.font.SysFont(None, 28)
        score_text = font.render(f"分数: {score}", True, (255,255,255))
        window.blit(score_text, (GRID_COLS*BLOCK_SIZE+10, 20))
        # s-17 暂停界面
        if game_state == GAME_STATE_PAUSE:
            overlay = pygame.Surface((GRID_COLS*BLOCK_SIZE, GRID_ROWS*BLOCK_SIZE), pygame.SRCALPHA)
            overlay.fill((0,0,0,150))
            window.blit(overlay, (0,0))
            font = pygame.font.SysFont(None, 48)
            text = font.render("暂停", True, (255,255,255))
            rect = text.get_rect(center=(GRID_COLS*BLOCK_SIZE//2, GRID_ROWS*BLOCK_SIZE//2))
            window.blit(text, rect)
            font2 = pygame.font.SysFont(None, 24)
            instr = font2.render("按 Space 继续", True, (200,200,200))
            rect2 = instr.get_rect(center=(GRID_COLS*BLOCK_SIZE//2, GRID_ROWS*BLOCK_SIZE//2+40))
            window.blit(instr, rect2)

    pygame.display.update()
    clock.tick(FPS)

pygame.quit()
