# 导入所需的包 (对应s-1)
import pygame  # PyGame主包
import random  # 用于随机生成方块

# 定义俄罗斯方块数据结构与类 (对应s-7)
class Tetromino:
    """
    俄罗斯方块单体类，包含形状变体与当前状态。
    形状变体(shape_variants)为旋转后的所有状态，颜色代表种类。
    pos为左上角在网格的坐标[x, y]。
    """
    def __init__(self, shape_variants, color, pos=(3, 0)):
        self.shape_variants = shape_variants  # List of 2D lists
        self.color = color
        self.current_variant = 0  # 当前旋转状态编号
        self.pos = list(pos)  # 拷贝初始位置
    
    def get_shape(self):
        return self.shape_variants[self.current_variant]
    
    def rotate(self):
        """顺时针旋转方块"""
        self.current_variant = (self.current_variant + 1) % len(self.shape_variants)
        
    def rotate_back(self):
        """逆时针旋转方块（如碰撞时可回退）"""
        self.current_variant = (self.current_variant - 1) % len(self.shape_variants)

# 所有方块的变体 (I, O, T, S, Z, J, L，对应s-7)
TETROMINO_SHAPES = [
    # I
    [
        [[1, 1, 1, 1]],
        [[1], [1], [1], [1]]
    ],
    # O
    [
        [[1, 1],
         [1, 1]]
    ],
    # T
    [
        [[0,1,0],[1,1,1]],
        [[1,0],[1,1],[1,0]],
        [[1,1,1],[0,1,0]],
        [[0,1],[1,1],[0,1]]
    ],
    # S
    [
        [[0,1,1],[1,1,0]],
        [[1,0],[1,1],[0,1]]
    ],
    # Z
    [
        [[1,1,0],[0,1,1]],
        [[0,1],[1,1],[1,0]]
    ],
    # J
    [
        [[1,0,0],[1,1,1]],
        [[1,1],[1,0],[1,0]],
        [[1,1,1],[0,0,1]],
        [[0,1],[0,1],[1,1]]
    ],
    # L
    [
        [[0,0,1],[1,1,1]],
        [[1,0],[1,0],[1,1]],
        [[1,1,1],[1,0,0]],
        [[1,1],[0,1],[0,1]]
    ]
]
TETROMINO_COLORS = [ (0,255,255), (255,255,0), (255,0,255), (0,255,0), (255,0,0), (0,0,255), (255,165,0) ]

# 随机生成新的方块的函数 (对应s-8)
def spawn_new_tetromino():
    """
    随机生成一个新的俄罗斯方块对象，并返回。
    初始位置固定为居中靠上（x=3, y=0）。
    """
    idx = random.randint(0, len(TETROMINO_SHAPES)-1)
    shape_variants = TETROMINO_SHAPES[idx]
    color = TETROMINO_COLORS[idx]
    return Tetromino(shape_variants, color, pos=(3,0))

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

# 各种俄罗斯方块形状（采用矩阵表示各状态，0为无块，1为有块）
# SHAPES 已被TETROMINO_SHAPES取代
# SHAPE_COLORS 已被TETROMINO_COLORS取代

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
    # 临时旋转
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
    # 回退旋转
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

# =================== 主循环示例代码，演示键盘移动方块和旋转 (增加旋转操作:s-10) ===================
running = True
while running:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        # 处理键盘事件，实现方块移动
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_LEFT:
                move_tetromino(current_tetromino, locked_grid, -1, 0)  # 向左
            elif event.key == pygame.K_RIGHT:
                move_tetromino(current_tetromino, locked_grid, 1, 0)   # 向右
            elif event.key == pygame.K_DOWN:
                move_tetromino(current_tetromino, locked_grid, 0, 1)   # 向下
            # =================== 新增旋转操作 (s-10) ===================
            elif event.key == pygame.K_UP:
                rotate_tetromino_if_possible(current_tetromino, locked_grid)  # 按上键尝试顺时针旋转，边界&冲突检测
    # 绘制界面
    window.fill(BLACK)
    draw_grid(window)
    draw_blocks(window, locked_grid, current_tetromino)
    pygame.display.update()
    clock.tick(FPS)
pygame.quit()
