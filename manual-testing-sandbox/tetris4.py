# 步骤s-1: 导入PyGame及其他必要包
import pygame
import random

# 步骤s-2: 初始化PyGame并创建游戏窗口
pygame.init()

# 步骤s-3: 定义游戏基本参数和常量
CELL_SIZE = 30                   # 单元格像素大小
COLS = 10                        # 游戏区域列数
ROWS = 20                        # 游戏区域行数
WIDTH = CELL_SIZE * COLS         # 游戏窗口宽度
HEIGHT = CELL_SIZE * ROWS        # 游戏窗口高度
FPS = 60                         # 帧率
BG_COLOR = (30, 30, 30)          # 背景颜色

# 步骤s-9: 新增自动下落相关常量（每多少毫秒方块自动下落一格）
FALL_INTERVAL = 500              # 自动下落时间间隔（毫秒）
last_fall_time = pygame.time.get_ticks()   # 记录上次下落时间

screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("俄罗斯方块")
clock = pygame.time.Clock()

# 步骤s-4: 绘制游戏网格与窗口背景
def draw_grid(surface):
    surface.fill(BG_COLOR)
    # 竖线
    for x in range(COLS + 1):
        pygame.draw.line(surface, (50, 50, 50), (x * CELL_SIZE, 0), (x * CELL_SIZE, HEIGHT))
    # 横线
    for y in range(ROWS + 1):
        pygame.draw.line(surface, (50, 50, 50), (0, y * CELL_SIZE), (WIDTH, y * CELL_SIZE))

# 步骤s-5: 定义所有俄罗斯方块形状及其颜色
SHAPES = {
    'I': [[1, 1, 1, 1]],
    'O': [[1, 1],
           [1, 1]],
    'T': [[0, 1, 0],
           [1, 1, 1]],
    'S': [[0, 1, 1],
           [1, 1, 0]],
    'Z': [[1, 1, 0],
           [0, 1, 1]],
    'J': [[1, 0, 0],
           [1, 1, 1]],
    'L': [[0, 0, 1],
           [1, 1, 1]]
}

SHAPE_COLORS = {
    'I': (0, 240, 240),     # 青色
    'O': (240, 240, 0),     # 黄色
    'T': (160, 0, 240),     # 紫色
    'S': (0, 240, 0),       # 绿色
    'Z': (240, 0, 0),       # 红色
    'J': (0, 0, 240),       # 蓝色
    'L': (240, 160, 0)      # 橙色
}

# 步骤s-6: 创建方块类，实现坐标、旋转与颜色属性
class Tetromino:
    def __init__(self, shape_key):
        self.shape_key = shape_key
        self.shape = [row[:] for row in SHAPES[shape_key]] # 深拷贝
        self.color = SHAPE_COLORS[shape_key]
        self.x = COLS // 2 - len(self.shape[0]) // 2   # 初始x坐标
        self.y = 0                                    # 初始y坐标
    def rotate(self):
        # 顺时针旋转 - 矩阵转置+反转
        self.shape = [list(row) for row in zip(*self.shape[::-1])]

    def get_cell_positions(self):
        # 获得当前方块所有单元格在网格中的坐标
        positions = []
        for i, row in enumerate(self.shape):
            for j, val in enumerate(row):
                if val:
                    positions.append((self.x + j, self.y + i))
        return positions

# 步骤s-7: 显示和渲染当前下落与已落地方块
def draw_block(surface, x, y, color):
    rect = pygame.Rect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE)
    pygame.draw.rect(surface, color, rect)
    pygame.draw.rect(surface, (80, 80, 80), rect, 2) # 方块边框

# 初始化网格：0表示空，否则为颜色元组
board = [[0 for _ in range(COLS)] for _ in range(ROWS)]

# 随机生成一个当前下落方块
def spawn_tetromino():
    key = random.choice(list(SHAPES.keys()))
    return Tetromino(key)
current = spawn_tetromino()

# 绘制所有已落地方块和当前方块
def draw_blocks(surface, board, current):
    # 绘制已落地方块
    for y in range(ROWS):
        for x in range(COLS):
            if board[y][x]:
                draw_block(surface, x, y, board[y][x])
    # 绘制当前下落方块
    for pos in current.get_cell_positions():
        px, py = pos
        if 0 <= px < COLS and 0 <= py < ROWS:
            draw_block(surface, px, py, current.color)

# 步骤s-8: 处理玩家输入，实现方块移动与旋转
def can_move(tetro, dx, dy, board):
    for x, y in tetro.get_cell_positions():
        nx, ny = x + dx, y + dy
        if nx < 0 or nx >= COLS or ny < 0 or ny >= ROWS:
            return False
        if ny >= 0 and board[ny][nx]:
            return False
    return True

def can_rotate(tetro, board):
    # 检查旋转后的形状是否有效
    shape = [list(row) for row in zip(*tetro.shape[::-1])]
    for i, row in enumerate(shape):
        for j, val in enumerate(row):
            if val:
                nx = tetro.x + j
                ny = tetro.y + i
                if nx < 0 or nx >= COLS or ny < 0 or ny >= ROWS:
                    return False
                if ny >= 0 and board[ny][nx]:
                    return False
    return True

# 步骤s-9: 实现方块自动下落逻辑
# ---- 新增函数：让当前方块自动下落 ----
def lock_tetromino_on_board(board, tetro):
    """
    将方块写入网格（已落地），且保持原颜色不变。
    """
    for x, y in tetro.get_cell_positions():
        if 0 <= x < COLS and 0 <= y < ROWS:
            board[y][x] = tetro.color

running = True
while running:
    clock.tick(FPS)
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_LEFT:
                if can_move(current, -1, 0, board):
                    current.x -= 1
            elif event.key == pygame.K_RIGHT:
                if can_move(current, 1, 0, board):
                    current.x += 1
            elif event.key == pygame.K_DOWN:
                if can_move(current, 0, 1, board):
                    current.y += 1
            elif event.key == pygame.K_UP:
                if can_rotate(current, board):
                    current.rotate()
    
    # 步骤s-9: 方块自动下落实现
    current_time = pygame.time.get_ticks()
    if current_time - last_fall_time > FALL_INTERVAL:
        # 检查是否能自动下落
        if can_move(current, 0, 1, board):
            current.y += 1
        else:
            # 方块不能继续下落，锁定到网格
            lock_tetromino_on_board(board, current)
            # 生成新方块
            current = spawn_tetromino()
            # TODO: 可以完善游戏结束检测逻辑（此处暂未实现）
        # 更新时间
        last_fall_time = current_time
    
    # 绘制界面
    draw_grid(screen)
    draw_blocks(screen, board, current)
    pygame.display.flip()

pygame.quit()
