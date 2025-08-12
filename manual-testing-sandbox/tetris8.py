# 导入PyGame及其他必要模块
import pygame
import sys
import random

# 初始化PyGame并设置主窗口
pygame.init()  # 初始化所有导入的pygame模块

# 定义游戏常量（行数、列数和格子大小）
CELL_SIZE = 30      # 每个小格的像素大小
COLS = 10           # 游戏区域列数（宽度）
ROWS = 20           # 游戏区域行数（高度）
WIDTH = CELL_SIZE * COLS    # 窗口宽度
HEIGHT = CELL_SIZE * ROWS   # 窗口高度

# 创建游戏主窗口
window = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption('俄罗斯方块')

# 定义方块形状和对应颜色
# 各形状：I, O, T, S, Z, J, L
# 用二维数组描述方块在4x4网格中的占位情况
SHAPES = [
    # I
    [[
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
    ]],
    # O
    [[
        [0, 0, 0, 0],
        [0, 1, 1, 0],
        [0, 1, 1, 0],
        [0, 0, 0, 0],
    ]],
    # T
    [[
        [0, 0, 0, 0],
        [1, 1, 1, 0],
        [0, 1, 0, 0],
        [0, 0, 0, 0],
    ]],
    # S
    [[
        [0, 0, 0, 0],
        [0, 1, 1, 0],
        [1, 1, 0, 0],
        [0, 0, 0, 0],
    ]],
    # Z
    [[
        [0, 0, 0, 0],
        [1, 1, 0, 0],
        [0, 1, 1, 0],
        [0, 0, 0, 0],
    ]],
    # J
    [[
        [0, 0, 0, 0],
        [1, 1, 1, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 0],
    ]],
    # L
    [[
        [0, 0, 0, 0],
        [1, 1, 1, 0],
        [1, 0, 0, 0],
        [0, 0, 0, 0],
    ]],
]

# 每种方块对应独特颜色（按常见俄罗斯方块色系定义）
COLORS = [
    (0, 255, 255),    # I型: 青色
    (255, 255, 0),    # O型: 黄色
    (128, 0, 128),    # T型: 紫色
    (0, 255, 0),      # S型: 绿色
    (255, 0, 0),      # Z型: 红色
    (0, 0, 255),      # J型: 蓝色
    (255, 165, 0),    # L型: 橙色
]

# ----------------------- 新增功能实现 -----------------------

# s-5: 实现方块类并管理其位置、形状与颜色
class Tetromino:
    def __init__(self, shape_idx):
        self.shape_idx = shape_idx  # 方块类型下标
        self.rot = 0  # 当前旋转次数（0, 1, 2, 3）
        self.shape = SHAPES[shape_idx][0]  # 当前形状矩阵（4x4）
        self.color = COLORS[shape_idx]  # 当前颜色
        # 初始位置：顶部中央
        self.row = 0
        self.col = COLS // 2 - 2  # 由于是4x4矩阵

    def get_current_shape(self):
        # 返回当前旋转后的形状
        return self.shape

    def rotate(self):
        # 旋转：矩阵逆转（4x4）
        new_shape = [ [0]*4 for _ in range(4) ]
        for i in range(4):
            for j in range(4):
                new_shape[j][3-i] = self.shape[i][j]
        self.shape = new_shape
        self.rot = (self.rot + 1) % 4

    def rotate_preview(self):
        # 返回旋转后不修改自身的矩阵
        new_shape = [ [0]*4 for _ in range(4) ]
        for i in range(4):
            for j in range(4):
                new_shape[j][3-i] = self.shape[i][j]
        return new_shape

    def move(self, drow, dcol):
        self.row += drow
        self.col += dcol

    def set_position(self, row, col):
        self.row = row
        self.col = col

# s-6: 创建游戏棋盘（堆积区）数据结构
# 棋盘为ROWS行COLS列的二维数组，每个元素为None（无方块）或(color)
board = [ [None for _ in range(COLS)] for _ in range(ROWS) ]

# s-7/s-8: 方块移动/旋转/碰撞检测相关辅助函数

def valid_position(tetromino, board, row_offset=0, col_offset=0, new_shape=None):
    # 检查当前tetromino在(board)上指定偏移后的所有格是否合法（未碰撞且在边界内）
    shape = new_shape if new_shape is not None else tetromino.get_current_shape()
    for i in range(4):
        for j in range(4):
            if shape[i][j]:
                r = tetromino.row + i + row_offset
                c = tetromino.col + j + col_offset
                if r < 0 or r >= ROWS or c < 0 or c >= COLS:
                    return False  # 出界
                if board[r][c]:
                    return False  # 已有方块
    return True

# s-7: 方块移动和旋转的方法（包含碰撞判定）
def move_left(tetromino, board):
    if valid_position(tetromino, board, col_offset=-1):
        tetromino.move(0, -1)

def move_right(tetromino, board):
    if valid_position(tetromino, board, col_offset=1):
        tetromino.move(0, 1)

def move_down(tetromino, board):
    if valid_position(tetromino, board, row_offset=1):
        tetromino.move(1, 0)
        return True
    return False

def rotate_tetromino(tetromino, board):
    preview_shape = tetromino.rotate_preview()
    if valid_position(tetromino, board, new_shape=preview_shape):
        tetromino.rotate()

# s-9: 方块落地并加入棋盘

def lock_to_board(tetromino, board):
    for i in range(4):
        for j in range(4):
            if tetromino.shape[i][j]:
                r = tetromino.row + i
                c = tetromino.col + j
                if 0 <= r < ROWS and 0 <= c < COLS:
                    board[r][c] = tetromino.color
    # 落地后无需操作tetromino本身

# s-10: 检测并消除已满的完整行

def clear_full_lines(board):
    lines_cleared = 0
    new_board = []
    for row in board:
        if all(cell is not None for cell in row):
            lines_cleared += 1
        else:
            new_board.append(row)
    # 补上新空行（在最前面）
    while len(new_board) < ROWS:
        new_board.insert(0, [None for _ in range(COLS)])
    for r in range(ROWS):
        board[r] = new_board[r]
    return lines_cleared

# s-11: 生成与管理下一个方块
def create_new_tetromino():
    return Tetromino(random.randint(0, len(SHAPES)-1))

current_tetromino = create_new_tetromino()
next_tetromino = create_new_tetromino()

def spawn_tetromino():
    global current_tetromino, next_tetromino
    current_tetromino = next_tetromino
    next_tetromino = create_new_tetromino()
    current_tetromino.set_position(0, COLS // 2 - 2)
    # 返回游戏是否结束（顶层被占据说明结束），用于后续实现gameover逻辑
    if not valid_position(current_tetromino, board):
        return False
    return True

# s-12: 绘制棋盘与所有方块，包括颜色呈现
def draw_board(surface, board, active_tetromino):
    # 填充背景
    surface.fill((0, 0, 0))
    # 绘制堆积方块
    for r in range(ROWS):
        for c in range(COLS):
            if board[r][c]:
                pygame.draw.rect(
                    surface, board[r][c],
                    (c*CELL_SIZE, r*CELL_SIZE, CELL_SIZE, CELL_SIZE)
                )
                pygame.draw.rect(
                    surface, (40, 40, 40),
                    (c*CELL_SIZE, r*CELL_SIZE, CELL_SIZE, CELL_SIZE),
                    1
                )
    # 绘制当前活动方块
    shape = active_tetromino.get_current_shape()
    for i in range(4):
        for j in range(4):
            if shape[i][j]:
                r = active_tetromino.row + i
                c = active_tetromino.col + j
                if 0 <= r < ROWS and 0 <= c < COLS:
                    pygame.draw.rect(
                        surface, active_tetromino.color,
                        (c*CELL_SIZE, r*CELL_SIZE, CELL_SIZE, CELL_SIZE)
                    )
                    pygame.draw.rect(
                        surface, (200, 200, 200),
                        (c*CELL_SIZE, r*CELL_SIZE, CELL_SIZE, CELL_SIZE),
                        1
                    )
    # 可在这里添加预览下一个方块的显示

    pygame.display.flip()

# 注：主循环等后续功能暂未实现，留给下步。