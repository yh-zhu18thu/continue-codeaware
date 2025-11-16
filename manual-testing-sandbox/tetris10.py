# 导入俄罗斯方块所需的库
import pygame       # 游戏开发框架
import sys          # 系统退出等
import random       # 生成随机方块

# =====================
# 步骤s-4: 定义方块形状与类型
# =====================
# 俄罗斯方块标准7种形状（I, O, T, S, Z, J, L）
# 每个形状用含有小方块相对坐标的列表/矩阵表达，以旋转中心为基准
# 以下写法采用：每形状对应若干个旋转状态，每个状态用4个(x, y)相对坐标表示
TETROMINO_SHAPES = {
    'I': [
        [(0,1), (1,1), (2,1), (3,1)],   # ---- 横
        [(2,0), (2,1), (2,2), (2,3)],   # | 竖
    ],
    'O': [
        [(1,0), (2,0), (1,1), (2,1)],   # 2x2
    ],
    'T': [
        [(1,0), (0,1), (1,1), (2,1)],   # 正T
        [(1,0), (1,1), (1,2), (2,1)],
        [(0,1), (1,1), (2,1), (1,2)],
        [(0,1), (1,0), (1,1), (1,2)],
    ],
    'S': [
        [(1,0), (2,0), (0,1), (1,1)],   # 右上
        [(1,0), (1,1), (2,1), (2,2)],
    ],
    'Z': [
        [(0,0), (1,0), (1,1), (2,1)],   # 左上
        [(2,0), (2,1), (1,1), (1,2)],
    ],
    'J': [
        [(0,0), (0,1), (1,1), (2,1)],   # ┚
        [(1,0), (2,0), (1,1), (1,2)],
        [(0,1), (1,1), (2,1), (2,2)],
        [(1,0), (1,1), (0,2), (1,2)],
    ],
    'L': [
        [(2,0), (0,1), (1,1), (2,1)],   # ┗
        [(1,0), (1,1), (1,2), (2,2)],
        [(0,1), (1,1), (2,1), (0,2)],
        [(0,0), (1,0), (1,1), (1,2)],
    ],
}

# =====================
# 步骤s-5: 绑定固定颜色到每种方块
# =====================
# 分配独一无二的RGB颜色（tuple）给每种方块类型
TETROMINO_COLORS = {
    'I': (0, 240, 240),      # 青色
    'O': (240, 240, 0),      # 黄色
    'T': (160, 0, 240),      # 紫色
    'S': (0, 240, 0),        # 绿色
    'Z': (240, 0, 0),        # 红色
    'J': (0, 0, 240),        # 蓝色
    'L': (240, 160, 0),      # 橙色
}

# =====================
# 步骤s-7: 搭建游戏网格与存储已落地方块数据结构
# =====================
# 游戏区域尺寸为10列x20行
GRID_COLS = 10
GRID_ROWS = 20
CELL_SIZE = WINDOW_WIDTH // GRID_COLS  # 单格像素大小

# 定义游戏网格：每格为None/颜色tuple
# 格式: grid[y][x] （行列）
grid = [[None for _ in range(GRID_COLS)] for _ in range(GRID_ROWS)]

# =====================
# 步骤s-6: 实现方块生成与初步移动机制
# =====================
class Tetromino:
    def __init__(self, shape_name):
        self.shape_name = shape_name
        self.shape_states = TETROMINO_SHAPES[shape_name]
        self.state = 0  # 当前旋转状态索引
        self.blocks = self.shape_states[self.state]  # 初始形状
        self.color = TETROMINO_COLORS[shape_name]
        # 生成方块起始位置（顶部中间，注意适应各形状实际宽度）
        self.x = GRID_COLS // 2 - 2  # 左上角x（-2确保有空间）
        self.y = 0  # 顶部

    def get_cell_positions(self, new_x=None, new_y=None, new_state=None):
        # 返回当前各小块的（x, y）位置集合
        bx = self.x if new_x is None else new_x
        by = self.y if new_y is None else new_y
        bst = self.state if new_state is None else new_state
        return [(bx + dx, by + dy) for dx, dy in self.shape_states[bst]]

    def can_move(self, dx, dy):
        # 检查方块能否移动dx,dy
        for x, y in self.get_cell_positions(self.x + dx, self.y + dy):
            if x < 0 or x >= GRID_COLS or y < 0 or y >= GRID_ROWS:
                return False
            if grid[y][x] is not None:
                return False
        return True

    def move(self, dx, dy):
        if self.can_move(dx, dy):
            self.x += dx
            self.y += dy
            return True
        return False

    def can_place(self):
        # 是否能放在当前位置
        for x, y in self.get_cell_positions():
            if x < 0 or x >= GRID_COLS or y < 0 or y >= GRID_ROWS:
                return False
            if grid[y][x] is not None:
                return False
        return True

    def hard_drop(self):
        # 一直落到底（未做键盘操作使用，可放扩展）
        while self.move(0, 1):
            pass

# 生成新方块的函数

def create_new_tetromino():
    shape_name = random.choice(list(TETROMINO_SHAPES.keys()))
    return Tetromino(shape_name)

# 管理当前下落的活动方块
current_tetromino = create_new_tetromino()

game_over = False

drop_event = pygame.USEREVENT + 1  # 自定义事件：下落计时
pygame.time.set_timer(drop_event, 500)  # 每500ms触发一次

# =====================
# 步骤s-8: 实现消除行的判定与处理
# =====================
def clear_lines():
    global grid
    lines_cleared = 0
    new_grid = [row for row in grid if any(cell is None for cell in row)]
    lines_cleared = GRID_ROWS - len(new_grid)
    for _ in range(lines_cleared):
        new_grid.insert(0, [None for _ in range(GRID_COLS)])  # 顶部加空行
    grid = new_grid
    return lines_cleared

# =====================
# 绘制函数
# =====================
def draw_grid(surface):
    # 画已经落地的格子
    for y in range(GRID_ROWS):
        for x in range(GRID_COLS):
            color = grid[y][x]
            if color:
                pygame.draw.rect(
                    surface, color,
                    (x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE)
                )
                # 画边框
                pygame.draw.rect(surface, (40,40,40), (x*CELL_SIZE, y*CELL_SIZE, CELL_SIZE, CELL_SIZE), 1)

    # 画网格线（可选美观用）
    # for x in range(GRID_COLS+1):
    #     pygame.draw.line(surface, (60,60,60), (x*CELL_SIZE,0), (x*CELL_SIZE,WINDOW_HEIGHT))
    # for y in range(GRID_ROWS+1):
    #     pygame.draw.line(surface, (60,60,60), (0,y*CELL_SIZE),(WINDOW_WIDTH,y*CELL_SIZE))

def draw_tetromino(surface, tetromino):
    # 活动方块
    for x, y in tetromino.get_cell_positions():
        if 0 <= y < GRID_ROWS:
            pygame.draw.rect(
                surface, tetromino.color,
                (x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE)
            )
            pygame.draw.rect(surface, (200,200,200), (x*CELL_SIZE, y*CELL_SIZE, CELL_SIZE, CELL_SIZE), 1)

# 主循环，控制游戏运行和刷新速率
clock = pygame.time.Clock()       # 控制刷新速率
FPS = 60                         # 每秒刷新帧数

running = True                   # 主循环运行标记
while running:
    # 事件处理（后续将接入玩家操作逻辑）
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            pygame.quit()
            sys.exit()
        if event.type == drop_event and not game_over:
            # 方块自动下落一格
            if not current_tetromino.move(0, 1):
                # 不能再下落，说明要落地了
                for x, y in current_tetromino.get_cell_positions():
                    if y < 0:
                        game_over = True
                        running = False
                        break
                    grid[y][x] = current_tetromino.color  # 放入网格并保留颜色
                
                clear_lines()  # 消行（保留颜色）
                current_tetromino = create_new_tetromino()
                if not current_tetromino.can_place():
                    game_over = True
                    running = False
    
    # 清屏（后续会绘制方块）
    screen.fill((0, 0, 0))   # 填充黑色背景
    
    # 绘制已经落地的格子
    draw_grid(screen)
    # 绘制下落中的方块
    if not game_over:
        draw_tetromino(screen, current_tetromino)
    
    # 刷新界面显示
    pygame.display.flip()    # 更新画面

    # 控制刷新速率，让游戏流畅地跑起来
    clock.tick(FPS)
