# ******************************************
# s-1: 导入PyGame和其他必要的库
# ******************************************
import pygame
import sys
import random

# ******************************************
# s-2: 初始化PyGame并创建游戏窗口
# ******************************************
pygame.init()

# 主窗口像素尺寸设置
CELL_SIZE = 30   # 每格30像素
COLS = 10        # 10列（横向格数）
ROWS = 20        # 20行（纵向格数）
WIDTH = CELL_SIZE * COLS
HEIGHT = CELL_SIZE * ROWS

screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("俄罗斯方块 / Tetris")
clock = pygame.time.Clock()

# ******************************************
# s-3: 定义游戏区域与网格大小
# ******************************************
# 游戏主网格，用于记录所有下落和落地方块
# -1代表空，其他数字/字母代表对应方块种类
# 为方便颜色和后续引用，用None表示空格

def create_grid():
    # grid按行(row),列(col)顺序排布
    return [[None for _ in range(COLS)] for _ in range(ROWS)]

# ******************************************
# s-4: 设计方块类型及其形状数据结构
# ******************************************
# 每种方块所有旋转状态的模板（1为实方块，0为无方块）
SHAPES = {
    'I': [
        [
            [0, 0, 0, 0],
            [1, 1, 1, 1],
            [0, 0, 0, 0],
            [0, 0, 0, 0]
        ],
        [
            [0, 0, 1, 0],
            [0, 0, 1, 0],
            [0, 0, 1, 0],
            [0, 0, 1, 0]
        ]
    ],
    'O': [
        [
            [1, 1],
            [1, 1]
        ]
    ],
    'T': [
        [
            [0, 1, 0],
            [1, 1, 1],
            [0, 0, 0]
        ],
        [
            [0, 1, 0],
            [0, 1, 1],
            [0, 1, 0]
        ],
        [
            [0, 0, 0],
            [1, 1, 1],
            [0, 1, 0]
        ],
        [
            [0, 1, 0],
            [1, 1, 0],
            [0, 1, 0]
        ]
    ],
    'S': [
        [
            [0, 1, 1],
            [1, 1, 0],
            [0, 0, 0]
        ],
        [
            [1, 0, 0],
            [1, 1, 0],
            [0, 1, 0]
        ]
    ],
    'Z': [
        [
            [1, 1, 0],
            [0, 1, 1],
            [0, 0, 0]
        ],
        [
            [0, 1, 0],
            [1, 1, 0],
            [1, 0, 0]
        ]
    ],
    'J': [
        [
            [1, 0, 0],
            [1, 1, 1],
            [0, 0, 0]
        ],
        [
            [0, 1, 1],
            [0, 1, 0],
            [0, 1, 0]
        ],
        [
            [0, 0, 0],
            [1, 1, 1],
            [0, 0, 1]
        ],
        [
            [0, 1, 0],
            [0, 1, 0],
            [1, 1, 0]
        ]
    ],
    'L': [
        [
            [0, 0, 1],
            [1, 1, 1],
            [0, 0, 0]
        ],
        [
            [0, 1, 0],
            [0, 1, 0],
            [0, 1, 1]
        ],
        [
            [0, 0, 0],
            [1, 1, 1],
            [1, 0, 0]
        ],
        [
            [1, 1, 0],
            [0, 1, 0],
            [0, 1, 0]
        ]
    ]
}

# ******************************************
# s-5: 为每种方块类型分配固定颜色
# ******************************************
# 为每个类型的方块分配唯一的颜色（RGB格式），用于字段颜色引用
SHAPE_COLORS = {
    'I': (0, 255, 255),   # 青色
    'O': (255, 255, 0),   # 黄色
    'T': (128, 0, 128),   # 紫色
    'S': (0, 255, 0),     # 绿色
    'Z': (255, 0, 0),     # 红色
    'J': (0, 0, 255),     # 蓝色
    'L': (255, 165, 0)    # 橙色
}
# 通过此设置，所有方块在游戏过程中颜色始终一致

# ******************************************
# s-6: 生成和初始化新方块
# ******************************************
class Tetromino:
    """
    表示一个俄罗斯方块（包括类型、旋转形态、坐标、颜色）
    """
    def __init__(self):
        # 随机选取一种方块类型
        self.kind = random.choice(list(SHAPES.keys()))
        self.shape_states = SHAPES[self.kind]      # 获取全部旋转状态
        self.rotation = 0                         # 初始旋转状态索引
        self.shape = self.shape_states[self.rotation]  # 当前形状
        self.color = SHAPE_COLORS[self.kind]      # 方块的固定颜色
        # 放置在顶部中央
        shape_width = len(self.shape[0])
        # 计算X初始位置：让方块横向居中
        self.x = (COLS - shape_width) // 2
        self.y = 0  # 顶部

    def rotate(self):
        '''尝试向右旋转，返回旋转后的形状，不改变原有rotation'''
        new_rotation = (self.rotation + 1) % len(self.shape_states)
        return self.shape_states[new_rotation]

    def apply_rotation(self):
        '''实际应用一次旋转'''
        self.rotation = (self.rotation + 1) % len(self.shape_states)
        self.shape = self.shape_states[self.rotation]

    def get_cells(self, x_off=0, y_off=0, shape_override=None):
        '''返回所有实际要占用的网格坐标，便于碰撞检测。可额外偏移(x_off, y_off)。'''
        coords = []
        shape = shape_override if shape_override is not None else self.shape
        for i, row in enumerate(shape):
            for j, block in enumerate(row):
                if block:
                    coords.append((self.y + i + y_off, self.x + j + x_off))  # (row, col)
        return coords

# ============================
# s-7: 方块移动和旋转机制的实现
# ============================
# 当前操作方块移动/旋转，需要键盘事件，并实现对应方法

def valid_position(tetromino, grid, x_off=0, y_off=0, shape_override=None):
    '''判断在给定偏移/旋转后，是否仍在网格内且不与已落地方块冲突'''
    for r, c in tetromino.get_cells(x_off, y_off, shape_override):
        if c < 0 or c >= COLS or r < 0 or r >= ROWS:
            return False
        if grid[r][c] is not None:
            return False
    return True

# =======================
# s-8: 边界检测与碰撞检测
# =======================
# 上面valid_position已实现边界与碰撞判断
# 
# 除了方块移动/旋转时要检测，也用于判断是否可以落地、生成新方块位置是否合法等

# ================================
# s-9: 实现行消除逻辑并保持原有颜色
# ================================
def clear_lines(grid):
    '''消除所有填满的行，并返回消除的行数'''
    cleared = 0
    new_grid = []
    for row in grid:
        if all(cell is not None for cell in row):
            cleared += 1
        else:
            new_grid.append(row)
    while len(new_grid) < ROWS:
        # 顶部补空（None）行，保持原有颜色
        new_grid.insert(0, [None for _ in range(COLS)])
    for i in range(ROWS):
        grid[i] = new_grid[i]
    return cleared

# ================================
# s-10: 绘制游戏网格和所有方块
# ================================
def draw_grid(surface, grid, tetromino=None):
    '''把网格与下落中的方块一起绘制出来'''
    # 先画落定方块
    for r in range(ROWS):
        for c in range(COLS):
            color = grid[r][c] if grid[r][c] is not None else (30, 30, 30)
            pygame.draw.rect(surface, color, (c*CELL_SIZE, r*CELL_SIZE, CELL_SIZE, CELL_SIZE))
            # 画格子线
            pygame.draw.rect(surface, (50,50,50), (c*CELL_SIZE, r*CELL_SIZE, CELL_SIZE, CELL_SIZE), 1)
    # 再画当前下落的方块
    if tetromino:
        for r, c in tetromino.get_cells():
            if 0 <= r < ROWS and 0 <= c < COLS:
                pygame.draw.rect(surface, tetromino.color, (c*CELL_SIZE, r*CELL_SIZE, CELL_SIZE, CELL_SIZE))
                pygame.draw.rect(surface, (255,255,255), (c*CELL_SIZE, r*CELL_SIZE, CELL_SIZE, CELL_SIZE), 2)

# ================================
# s-11: 处理玩家输入与事件响应
# ================================
def handle_events(active_tetromino, grid):
    '''处理用户键盘输入，并返回下一个active_tetromino位置/旋转方向'''
    move_x = 0
    hard_drop = False
    rotate = False
    soft_drop = False
    quit_game = False
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            quit_game = True
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_LEFT:
                move_x = -1
            elif event.key == pygame.K_RIGHT:
                move_x = 1
            elif event.key == pygame.K_DOWN:
                soft_drop = True
            elif event.key == pygame.K_UP:
                rotate = True
            elif event.key == pygame.K_q:
                quit_game = True
            elif event.key == pygame.K_SPACE:
                hard_drop = True
    # 处理左右移动
    if move_x != 0:
        if valid_position(active_tetromino, grid, x_off=move_x):
            active_tetromino.x += move_x
    # 处理旋转
    if rotate:
        new_shape = active_tetromino.rotate()
        if valid_position(active_tetromino, grid, shape_override=new_shape):
            active_tetromino.apply_rotation()
    return soft_drop, hard_drop, quit_game

# ================================
# s-12: 编写主循环并维护游戏状态
# ================================
def main():
    grid = create_grid()
    current = Tetromino()
    fall_time = 0
    fall_speed = 500  # 毫秒
    running = True
    game_over = False
    last_tick = pygame.time.get_ticks()
    score = 0

    while running:
        now = pygame.time.get_ticks()
        elapsed = now - last_tick
        last_tick = now
        fall_time += elapsed
        screen.fill((20, 20, 20))
        soft_drop, hard_drop, quit_game = handle_events(current, grid)
        if quit_game:
            running = False
            break

        # 软降速度更快
        cur_speed = 60 if soft_drop else fall_speed
        descend = False
        if fall_time > cur_speed:
            descend = True
            fall_time = 0

        # 下落1格
        if descend and not game_over:
            if valid_position(current, grid, y_off=1):
                current.y += 1
            else:
                # 到底/碰撞，把方块固定到网格上
                for r, c in current.get_cells():
                    if r < 0:
                        game_over = True
                        running = False
                        break
                    grid[r][c] = current.color
                # 消行
                lines = clear_lines(grid)
                score += lines
                # 产生新方块
                current = Tetromino()
                if not valid_position(current, grid):
                    # 新方块一出就挤占，游戏结束
                    game_over = True
                    running = False
        # 空格hard drop
        if hard_drop and not game_over:
            # 快速下落至不可再落
            while valid_position(current, grid, y_off=1):
                current.y += 1
            for r, c in current.get_cells():
                if r < 0:
                    game_over = True
                    running = False
                    break
                grid[r][c] = current.color
            lines = clear_lines(grid)
            score += lines
            current = Tetromino()
            if not valid_position(current, grid):
                game_over = True
                running = False

        # 绘制所有内容
        draw_grid(screen, grid, current if not game_over else None)

        # 分数显示
        fnt = pygame.font.SysFont(None, 32)
        text = fnt.render(f"分数: {score}", True, (255,255,255))
        screen.blit(text, (10, 10))
        # 游戏结束显示
        if game_over:
            over_font = pygame.font.SysFont(None, 64)
            over_surface = over_font.render("游戏结束", True, (255,0,0))
            screen.blit(over_surface, (WIDTH//2 - over_surface.get_width()//2, HEIGHT//2 - 32))

        pygame.display.flip()
        clock.tick(60)
    pygame.quit()
    sys.exit()

# =============================
# 测试/主程序启动
# =============================
if __name__ == "__main__":
    main()

# 你现在已经为每种方块分配了固定颜色，并实现了新方块的生成与初始化。
# 当前实现已具备方块移动、旋转、碰撞检测、消除行、绘制、事件响应和主循环等功能。
# 后续可以继续拓展分数/等级、下一个方块、暂停等模块。
