# 导入PyGame和必要的标准库
import pygame       # 导入PyGame游戏框架
import sys          # 导入系统库以便退出游戏
import random       # 导入随机库用于随机生成方块

# 初始化PyGame并设置窗口基础参数
pygame.init()                                   # 初始化PyGame内部模块

WINDOW_WIDTH = 300                              # 游戏窗口宽度
WINDOW_HEIGHT = 600                             # 游戏窗口高度
WINDOW_TITLE = "俄罗斯方块"                      # 游戏窗口标题

# === S-4: 绘制棋盘网格与初始化游戏场景 ===
GRID_ROWS = 20                    # 棋盘高度，以格为单位
GRID_COLS = 10                    # 棋盘宽度，以格为单位
CELL_SIZE = WINDOW_WIDTH // GRID_COLS  # 每个格子的像素大小，根据窗口宽度与列数计算
TOP_MARGIN = 0                    # 棋盘顶部边距（可设置为0）

screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))   # 创建窗口
pygame.display.set_caption(WINDOW_TITLE)                          # 设置窗口标题

def draw_grid(surface):
    # 绘制棋盘背景网格线，便于观察方块移动范围
    for row in range(GRID_ROWS):
        pygame.draw.line(
            surface,
            (40, 40, 40),
            (0, row * CELL_SIZE + TOP_MARGIN),
            (WINDOW_WIDTH, row * CELL_SIZE + TOP_MARGIN)
        )
    for col in range(GRID_COLS):
        pygame.draw.line(
            surface,
            (40, 40, 40),
            (col * CELL_SIZE, TOP_MARGIN),
            (col * CELL_SIZE, GRID_ROWS * CELL_SIZE + TOP_MARGIN)
        )

# 初始化游戏场景网格，0表示空，其它为不同类型方块的编号
board = [[0 for _ in range(GRID_COLS)] for _ in range(GRID_ROWS)]

# === S-5: 定义方块类型与形状 ===
# 标准俄罗斯方块7种形状，使用4x4方阵描述（以1表示方块在该处存在）
TETROMINO_SHAPES = {
    # I型
    'I': [
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
    ],
    # O型
    'O': [
        [0, 1, 1, 0],
        [0, 1, 1, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
    ],
    # T型
    'T': [
        [0, 1, 0, 0],
        [1, 1, 1, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
    ],
    # S型
    'S': [
        [0, 1, 1, 0],
        [1, 1, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
    ],
    # Z型
    'Z': [
        [1, 1, 0, 0],
        [0, 1, 1, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
    ],
    # J型
    'J': [
        [1, 0, 0, 0],
        [1, 1, 1, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
    ],
    # L型
    'L': [
        [0, 0, 1, 0],
        [1, 1, 1, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
    ],
}
TETROMINO_LIST = list(TETROMINO_SHAPES.keys())  # 用于随机方块类型选择

# === S-6: 为每种方块分配固定颜色 ===
# 每种类型唯一对应一种RGB颜色
TETROMINO_COLORS = {
    'I': (0, 255, 255),    # 青色
    'O': (255, 255, 0),    # 黄色
    'T': (160, 0, 240),    # 紫色
    'S': (0, 255, 0),      # 绿色
    'Z': (255, 0, 0),      # 红色
    'J': (0, 0, 255),      # 蓝色
    'L': (255, 160, 0),    # 橙色
    # 0: 纯空/黑色，不用于渲染
}

# === S-7: 实现方块随机生成和初始定位 ===

def get_new_tetromino():
    # 随机选一个类型和其形状与颜色
    shape_key = random.choice(TETROMINO_LIST)
    # 形状是4x4矩阵
    shape = [row[:] for row in TETROMINO_SHAPES[shape_key]]  # 深拷贝
    color = TETROMINO_COLORS[shape_key]
    # 初始方块y, x（左上角在网格中的位置）默认x居中，y在顶部
    x = (GRID_COLS - 4) // 2
    y = 0
    return {'shape': shape, 'color': color, 'type': shape_key, 'x': x, 'y': y}

# 当前活跃方块
current_tetromino = get_new_tetromino()

# 辅助：绘制当前活动方块
def draw_tetromino(surface, tetromino):
    shape = tetromino['shape']
    color = tetromino['color']
    for i in range(4):
        for j in range(4):
            if shape[i][j]:
                x = (tetromino['x'] + j) * CELL_SIZE
                y = (tetromino['y'] + i) * CELL_SIZE + TOP_MARGIN
                pygame.draw.rect(surface, color, (x, y, CELL_SIZE, CELL_SIZE))
                pygame.draw.rect(surface, (48, 48, 48), (x, y, CELL_SIZE, CELL_SIZE), 1)  # 绘制外框

# 辅助：绘制已经固定在场上的方块（如有）
def draw_board(surface, board):
    for row in range(GRID_ROWS):
        for col in range(GRID_COLS):
            cell = board[row][col]
            if cell:
                # cell是形状类型，如 'I'、'O' 等
                color = TETROMINO_COLORS.get(cell, (255,255,255))
                x = col * CELL_SIZE
                y = row * CELL_SIZE + TOP_MARGIN
                pygame.draw.rect(surface, color, (x, y, CELL_SIZE, CELL_SIZE))
                pygame.draw.rect(surface, (48, 48, 48), (x, y, CELL_SIZE, CELL_SIZE), 1)

# 设置主流程框架与游戏主循环
def main():
    clock = pygame.time.Clock()   # 创建时钟对象用于控制帧率
    running = True
    while running:
        for event in pygame.event.get():        # 处理所有事件
            if event.type == pygame.QUIT:
                running = False                # 用户关闭窗口时退出主循环

        screen.fill((0, 0, 0))                 # 用黑色填充背景，为后续游戏内容提供展示空间

        draw_grid(screen)                      # S-4: 绘制棋盘网格线
        draw_board(screen, board)              # 绘制棋盘上已固定方块
        draw_tetromino(screen, current_tetromino) # S-7: 绘制当前下落中方块

        pygame.display.flip()                  # 更新整个屏幕显示内容
        clock.tick(60)                         # 保持每秒60帧
    pygame.quit()
    sys.exit()

if __name__ == '__main__':
    main()
