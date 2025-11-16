# 导入PyGame和相关标准库
import pygame  # PyGame游戏框架
import random  # 用于生成随机方块
import sys     # 用于系统退出等操作

# ============================
# ---- Step 4: 定义方块形状、颜色与数据结构 ----
# ============================

# 各种俄罗斯方块形状的定义，使用坐标偏移（row, col），并给每种类型分配唯一颜色。
# 标准7种俄罗斯方块，全部用4个小正方形表示。
# 坐标均以形状中心点为参考，后续移动或旋转相对容易处理

# 方块形状定义，使用旋转状态的二维列表（每种方块的所有旋转形态）
TETROMINOS = {
    'I': [  # 一字型
        [[1, 1, 1, 1]],
        [[1], [1], [1], [1]]
    ],
    'J': [  # J型
        [[1, 0, 0], [1, 1, 1]],
        [[1, 1], [1, 0], [1, 0]],
        [[1, 1, 1], [0, 0, 1]],
        [[0, 1], [0, 1], [1, 1]]
    ],
    'L': [  # L型
        [[0, 0, 1], [1, 1, 1]],
        [[1, 0], [1, 0], [1, 1]],
        [[1, 1, 1], [1, 0, 0]],
        [[1, 1], [0, 1], [0, 1]]
    ],
    'O': [  # 正方形
        [[1,1],[1,1]]
    ],
    'S': [  # S型
        [[0,1,1],[1,1,0]],
        [[1,0],[1,1],[0,1]]
    ],
    'T': [  # T型
        [[0,1,0],[1,1,1]],
        [[1,0],[1,1],[1,0]],
        [[1,1,1],[0,1,0]],
        [[0,1],[1,1],[0,1]]
    ],
    'Z': [  # Z型
        [[1,1,0],[0,1,1]],
        [[0,1],[1,1],[1,0]]
    ]
}

# 每种形状指定唯一颜色 (RGB格式)
TETROMINO_COLORS = {
    'I': (0, 240, 240),     # 青色
    'J': (0, 0, 240),       # 蓝色
    'L': (240, 160, 0),     # 橙色
    'O': (240, 240, 0),     # 黄色
    'S': (0, 240, 0),       # 绿色
    'T': (160, 0, 240),     # 紫色
    'Z': (240, 0, 0)        # 红色
}

# =====================
# 棋盘状态（用于存储已固定的方块：用None/名字/或(None,Color)等区分类型+颜色）
# 初始化所有格为None
board = [[None for _ in range(GRID_COLS)] for _ in range(GRID_ROWS)]

# ============================
# ---- Step 5: 方块生成与运动的核心逻辑 ----
# ============================

# 方块数据结构定义：包含形状名称、旋转态编号、左上角坐标、颜色
class Tetromino:
    def __init__(self, name):
        self.name = name  # 形状名
        self.shapes = TETROMINOS[name]              # 旋转形态list
        self.rotation = 0                           # 当前旋转序号
        self.color = TETROMINO_COLORS[name]         # 颜色
        self.shape = self.shapes[self.rotation]     # 当前形状（二维list）
        # 初始化位置：顶端居中
        self.x = GRID_COLS // 2 - len(self.shape[0]) //2
        self.y = 0  # 顶部
    def rotate(self):
        prev_rotation = self.rotation
        self.rotation = (self.rotation + 1) % len(self.shapes)
        self.shape = self.shapes[self.rotation]
        # 旋转返回前的旋转编号，供失败时回退
        return prev_rotation
    def set_rotation(self, rot):
        self.rotation = rot
        self.shape = self.shapes[self.rotation]

# 当前活动方块
current_tetromino = None
fall_delay = 500  # 方块下落间隔（毫秒）
last_fall_time = pygame.time.get_ticks()  # 上次下落的时间戳

def create_new_tetromino():
    name = random.choice(list(TETROMINOS.keys()))
    tetro = Tetromino(name)
    return tetro

def does_tetromino_collide(tetro, dx=0, dy=0, test_shape=None):
    # 检查方块在dx,dy位移下能否与已固定方块或边界碰撞("test_shape"可用于旋转校验)
    shape = test_shape if test_shape else tetro.shape
    for row in range(len(shape)):
        for col in range(len(shape[0])):
            if shape[row][col]:
                new_x = tetro.x + col + dx
                new_y = tetro.y + row + dy
                # 边界检测
                if new_x < 0 or new_x >= GRID_COLS or new_y >= GRID_ROWS:
                    return True
                # 与已固定方块碰撞
                if new_y >= 0 and new_y < GRID_ROWS:
                    if board[new_y][new_x] is not None:
                        return True
    return False

# 生成第一个方块
current_tetromino = create_new_tetromino()
# ============================
# ---- Step 6: 方块固定到棋盘与新方块生成 ----
# ============================

def lock_tetromino(tetro):
    # 将活动方块固定到棋盘数组
    for row in range(len(tetro.shape)):
        for col in range(len(tetro.shape[0])):
            if tetro.shape[row][col]:
                board_y = tetro.y + row
                board_x = tetro.x + col
                if 0 <= board_y < GRID_ROWS and 0 <= board_x < GRID_COLS:
                    board[board_y][board_x] = (tetro.name, tetro.color)  # 保存类型和颜色

def spawn_new_tetromino():
    global current_tetromino
    current_tetromino = create_new_tetromino()
    # 检查新方块生成点是否已被占据，如是则判定为无法继续（留待更后面实现Game Over时用）
    if does_tetromino_collide(current_tetromino):
        # 这里先不做Game Over处理，等后续环节实现
        pass

# ============================
# ---- Step 7: 方块旋转与边界校验 ----
# ============================

def try_rotate_tetromino(tetro):
    prev_rotation = tetro.rotate()
    # 旋转后如果碰撞，则回滚，不旋转
    if does_tetromino_collide(tetro):
        tetro.set_rotation(prev_rotation)  # 回退
        return False
    return True

# ============================
# ---- Step 8: 渲染当前与已固定方块及颜色 ----
# ============================

def draw_block(x, y, color):
    rect = pygame.Rect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE)
    pygame.draw.rect(screen, color, rect)
    pygame.draw.rect(screen, (30,30,30), rect, 1)  # 灰色描边

def draw_board():
    # 绘制已固定的方块
    for row in range(GRID_ROWS):
        for col in range(GRID_COLS):
            cell = board[row][col]
            if cell:
                _, color = cell
                draw_block(col, row, color)
def draw_tetromino(tetro):
    # 绘制当前活动的下落方块
    for row in range(len(tetro.shape)):
        for col in range(len(tetro.shape[0])):
            if tetro.shape[row][col]:
                draw_block(tetro.x + col, tetro.y + row, tetro.color)

# ============================
# ---- 主循环框架 ----
# ============================
running = True
while running:
    # 处理事件（包括退出等）
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        # === Step 9: 按键控制将在后续实现 ===
        if event.type == pygame.KEYDOWN:
            # 旋转（上方向键）
            if event.key == pygame.K_UP:
                try_rotate_tetromino(current_tetromino)
            # 左移
            elif event.key == pygame.K_LEFT:
                if not does_tetromino_collide(current_tetromino, dx=-1):
                    current_tetromino.x -= 1
            # 右移
            elif event.key == pygame.K_RIGHT:
                if not does_tetromino_collide(current_tetromino, dx=1):
                    current_tetromino.x += 1
            # 下移(软降)
            elif event.key == pygame.K_DOWN:
                if not does_tetromino_collide(current_tetromino, dy=1):
                    current_tetromino.y += 1
                else:
                    # 软降到底
                    lock_tetromino(current_tetromino)
                    spawn_new_tetromino()
    # === Step 5: 方块自动下落核心逻辑 ===
    now = pygame.time.get_ticks()
    if now - last_fall_time > fall_delay:
        last_fall_time = now
        # 尝试向下移动
        if not does_tetromino_collide(current_tetromino, dy=1):
            current_tetromino.y += 1
        else:
            # 已到底或撞到其它方块，定住并生成新方块
            lock_tetromino(current_tetromino)
            spawn_new_tetromino()
    # 清屏，填充背景色
    screen.fill((0, 0, 0))  # 黑色背景
    # 绘制已固定方块和当前下落方块
    draw_board()
    draw_tetromino(current_tetromino)
    pygame.display.flip()   # 更新窗口显示
    clock.tick(60)         # 控制帧率为60 FPS

# 退出PyGame与系统
pygame.quit()
sys.exit()
