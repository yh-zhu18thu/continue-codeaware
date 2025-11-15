# 导入PyGame及相关依赖
import pygame
import random

# 初始化PyGame和设置游戏常量
pygame.init()

# 游戏区域尺寸（格子数）
GRID_WIDTH = 10
GRID_HEIGHT = 20
BLOCK_SIZE = 30  # 单个方块像素尺寸

# 计算窗口像素大小
WINDOW_WIDTH = BLOCK_SIZE * GRID_WIDTH
WINDOW_HEIGHT = BLOCK_SIZE * GRID_HEIGHT

# 帧率
FPS = 60

# 自动下落的时间间隔（毫秒）
DROP_INTERVAL = 500  # 每500ms自动下落一次

# 创建并显示游戏窗口
screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
pygame.display.set_caption("俄罗斯方块 Tetris")
clock = pygame.time.Clock()

# 定义所有俄罗斯方块形状及对应颜色
# 形状矩阵采用4x4的布局，1表示有方块，0表示无
SHAPES = {
    'I': [
        [
            [0,0,0,0],
            [1,1,1,1],
            [0,0,0,0],
            [0,0,0,0]
        ],
        [
            [0,0,1,0],
            [0,0,1,0],
            [0,0,1,0],
            [0,0,1,0]
        ]
    ],
    'O': [
        [
            [0,1,1,0],
            [0,1,1,0],
            [0,0,0,0],
            [0,0,0,0]
        ]
    ],
    'T': [
        [
            [0,1,0,0],
            [1,1,1,0],
            [0,0,0,0],
            [0,0,0,0]
        ],
        [
            [0,1,0,0],
            [0,1,1,0],
            [0,1,0,0],
            [0,0,0,0]
        ],
        [
            [0,0,0,0],
            [1,1,1,0],
            [0,1,0,0],
            [0,0,0,0]
        ],
        [
            [0,1,0,0],
            [1,1,0,0],
            [0,1,0,0],
            [0,0,0,0]
        ]
    ],
    'S': [
        [
            [0,1,1,0],
            [1,1,0,0],
            [0,0,0,0],
            [0,0,0,0]
        ],
        [
            [1,0,0,0],
            [1,1,0,0],
            [0,1,0,0],
            [0,0,0,0]
        ]
    ],
    'Z': [
        [
            [1,1,0,0],
            [0,1,1,0],
            [0,0,0,0],
            [0,0,0,0]
        ],
        [
            [0,1,0,0],
            [1,1,0,0],
            [1,0,0,0],
            [0,0,0,0]
        ]
    ],
    'J': [
        [
            [1,0,0,0],
            [1,1,1,0],
            [0,0,0,0],
            [0,0,0,0]
        ],
        [
            [0,1,1,0],
            [0,1,0,0],
            [0,1,0,0],
            [0,0,0,0]
        ],
        [
            [0,0,0,0],
            [1,1,1,0],
            [0,0,1,0],
            [0,0,0,0]
        ],
        [
            [0,1,0,0],
            [0,1,0,0],
            [1,1,0,0],
            [0,0,0,0]
        ]
    ],
    'L': [
        [
            [0,0,1,0],
            [1,1,1,0],
            [0,0,0,0],
            [0,0,0,0]
        ],
        [
            [0,1,0,0],
            [0,1,0,0],
            [0,1,1,0],
            [0,0,0,0]
        ],
        [
            [0,0,0,0],
            [1,1,1,0],
            [1,0,0,0],
            [0,0,0,0]
        ],
        [
            [1,1,0,0],
            [0,1,0,0],
            [0,1,0,0],
            [0,0,0,0]
        ]
    ]
}

# 每种形状的固定颜色（RGB）
SHAPE_COLORS = {
    'I': (0, 255, 255),      # 青色
    'O': (255, 255, 0),      # 黄色
    'T': (128, 0, 128),      # 紫色
    'S': (0, 255, 0),        # 绿色
    'Z': (255, 0, 0),        # 红色
    'J': (0, 0, 255),        # 蓝色
    'L': (255, 165, 0)       # 橙色
}

# 设计方块类及其移动旋转方法
class Tetromino:
    def __init__(self, shape):
        self.shape = shape  # 例如 'T', 'O', ...
        self.rotations = SHAPES[shape]
        self.rotation = 0  # 旋转序号
        # 起始位置在顶部中央
        self.x = GRID_WIDTH // 2 - 2
        self.y = 0
        self.color = SHAPE_COLORS[shape]

    def get_matrix(self):
        """返回当前旋转状态下的形状矩阵"""
        return self.rotations[self.rotation]

    def move(self, dx, dy):
        """
        移动方块位置。
        dx: x方向变化，dy: y方向变化。
        """
        self.x += dx
        self.y += dy

    def rotate(self):
        """
        顺时针旋转方块
        """
        self.rotation = (self.rotation + 1) % len(self.rotations)

    def rotate_anticlockwise(self):
        """
        逆时针旋转方块
        """
        self.rotation = (self.rotation - 1) % len(self.rotations)

# ----- 新增内容开始：实现基础游戏机制（玩家操作+自动下落） -----
# 初始化用于表示已静止的方块的二维网格，None为空格，否则为颜色元组
board = [[None for _ in range(GRID_WIDTH)] for _ in range(GRID_HEIGHT)]

# 当前正在操作的方块
current = Tetromino(random.choice(list(SHAPES.keys())))

# 记录上一次自动下落的时间（毫秒）
last_drop_time = pygame.time.get_ticks()

def check_collision(tetro, dx=0, dy=0, rotation=None):
    """
    检查方块在指定移动或旋转情况下是否会碰撞
    dx, dy: 相对移动量
    rotation: 若提供则模拟旋转（否则使用当前旋转）
    """
    shape = tetro.get_matrix() if rotation is None else tetro.rotations[rotation]
    for row in range(4):
        for col in range(4):
            if shape[row][col]:
                x = tetro.x + col + dx
                y = tetro.y + row + dy
                # 检查边界
                if x < 0 or x >= GRID_WIDTH or y < 0 or y >= GRID_HEIGHT:
                    return True
                # 检查与已静止方块碰撞
                if y >= 0 and board[y][x] is not None:
                    return True
    return False

# 落地后将当前方块融合到场地
def merge_to_board(tetro):
    shape = tetro.get_matrix()
    for row in range(4):
        for col in range(4):
            if shape[row][col]:
                x = tetro.x + col
                y = tetro.y + row
                if 0 <= x < GRID_WIDTH and 0 <= y < GRID_HEIGHT:
                    board[y][x] = tetro.color  # 用方块类型颜色记录

# 绘制所有静止方块和当前活动方块
def draw_board():
    # 绘制已静止方块
    for y in range(GRID_HEIGHT):
        for x in range(GRID_WIDTH):
            color = board[y][x]
            if color:
                pygame.draw.rect(
                    screen, color,
                    (x*BLOCK_SIZE, y*BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE)
                )
    # 绘制当前活动方块
    shape = current.get_matrix()
    for row in range(4):
        for col in range(4):
            if shape[row][col]:
                x = current.x + col
                y = current.y + row
                if 0 <= x < GRID_WIDTH and 0 <= y < GRID_HEIGHT:
                    pygame.draw.rect(
                        screen, current.color,
                        (x*BLOCK_SIZE, y*BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE)
                    )

# ----- 新增内容结束 -----

# 实现游戏主循环
running = True
while running:
    clock.tick(FPS)

    # 检查事件（部分玩家输入处理）
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        # 处理玩家输入与方块操作（s-7）
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_LEFT:
                # 左移方块
                if not check_collision(current, dx=-1):
                    current.move(-1, 0)
            elif event.key == pygame.K_RIGHT:
                # 右移方块
                if not check_collision(current, dx=1):
                    current.move(1, 0)
            elif event.key == pygame.K_DOWN:
                # 手动快速下落一行
                if not check_collision(current, dy=1):
                    current.move(0, 1)
            elif event.key == pygame.K_UP:
                # 顺时针旋转
                new_rotation = (current.rotation + 1) % len(current.rotations)
                if not check_collision(current, rotation=new_rotation):
                    current.rotation = new_rotation
            elif event.key == pygame.K_z:  # 逆时针旋转（可选）
                new_rotation = (current.rotation - 1) % len(current.rotations)
                if not check_collision(current, rotation=new_rotation):
                    current.rotation = new_rotation

    # 实现方块自动下落与碰撞检测（s-8）
    now = pygame.time.get_ticks()
    if now - last_drop_time > DROP_INTERVAL:
        last_drop_time = now
        if not check_collision(current, dy=1):
            current.move(0,1)
        else:
            # 方块到达底部 或 遇到障碍，静止在当前位置
            merge_to_board(current)
            # 检查是否游戏结束（有方块直接合入顶端）
            if current.y == 0:
                running = False
            # 生成新方块
            current = Tetromino(random.choice(list(SHAPES.keys())))

    # 填充背景为黑色
    screen.fill((0, 0, 0))

    # 绘制静止方块和当前活动方块
    draw_board()

    pygame.display.flip()

pygame.quit()
