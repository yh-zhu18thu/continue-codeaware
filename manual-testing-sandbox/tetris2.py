# ------------------- 依赖包与初始化 -------------------
import pygame
import random
import sys

pygame.init()

# ------------------- 全局变量定义 -------------------
CELL_SIZE = 30             # 方块单元像素
COLUMNS = 10            # 主游戏区列数
ROWS = 20               # 主游戏区行数
WINDOW_WIDTH = 600
WINDOW_HEIGHT = 700
GAME_AREA_X = 30        # 主游戏区 左上角x像素
GAME_AREA_Y = 30        # 主游戏区 左上角y像素
GAME_AREA_WIDTH = COLUMNS * CELL_SIZE
GAME_AREA_HEIGHT = ROWS * CELL_SIZE

# 创建主窗口和设置标题
screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
pygame.display.set_caption("俄罗斯方块(Tetris) by PyGame")

# 初始化游戏时钟，用于刷新率和动画控制
clock = pygame.time.Clock()
FPS = 30  # 游戏刷新帧率

# ----------------- 主界面布局相关 -----------------
# 分数显示区域的位置
SCORE_AREA_X = GAME_AREA_X + GAME_AREA_WIDTH + 30
SCORE_AREA_Y = GAME_AREA_Y
# 预览下一个方块区域的位置
NEXT_AREA_X = SCORE_AREA_X
NEXT_AREA_Y = SCORE_AREA_Y + 80

# ------------------ 方块形状与颜色 ------------------
# 各种俄罗斯方块造型，采用4x4矩阵，通过旋转方式实现形状变化
SHAPES = {
    'I': [
        [[0,0,0,0], [1,1,1,1], [0,0,0,0], [0,0,0,0]],
        [[0,0,1,0], [0,0,1,0], [0,0,1,0], [0,0,1,0]]
    ],
    'O': [
        [[0,1,1,0], [0,1,1,0], [0,0,0,0], [0,0,0,0]]
    ],
    'T': [
        [[0,1,0], [1,1,1], [0,0,0]],
        [[0,1,0], [0,1,1], [0,1,0]],
        [[0,0,0], [1,1,1], [0,1,0]],
        [[0,1,0], [1,1,0], [0,1,0]]
    ],
    'S': [
        [[0,1,1], [1,1,0], [0,0,0]],
        [[1,0,0], [1,1,0], [0,1,0]]
    ],
    'Z': [
        [[1,1,0], [0,1,1], [0,0,0]],
        [[0,1,0], [1,1,0], [1,0,0]]
    ],
    'J': [
        [[1,0,0], [1,1,1], [0,0,0]],
        [[0,1,1], [0,1,0], [0,1,0]],
        [[0,0,0], [1,1,1], [0,0,1]],
        [[0,1,0], [0,1,0], [1,1,0]]
    ],
    'L': [
        [[0,0,1], [1,1,1], [0,0,0]],
        [[0,1,0], [0,1,0], [0,1,1]],
        [[0,0,0], [1,1,1], [1,0,0]],
        [[1,1,0], [0,1,0], [0,1,0]]
    ]
}

# 方块对应的颜色（RGB）
COLORS = {
    'I': (0, 255, 255),   # 青色
    'O': (255, 255, 0),   # 黄色
    'T': (128, 0, 128),   # 紫色
    'S': (0, 255, 0),     # 绿色
    'Z': (255, 0, 0),     # 红色
    'J': (0, 0, 255),     # 蓝色
    'L': (255, 165, 0)    # 橙色
}

# ------------------ 方块类定义 ------------------
class Tetromino:
    def __init__(self, shape):
        self.shape = shape
        self.states = SHAPES[shape]
        self.state = 0  # 初始旋转状态索引
        self.matrix = self.states[self.state]
        self.color = COLORS[shape]
        # 方块初始出现的逻辑位置（列、行）
        self.x = COLUMNS // 2 - len(self.matrix[0]) // 2
        self.y = 0
    
    def rotate(self):
        # 旋转到下一个状态
        next_state = (self.state + 1) % len(self.states)
        next_matrix = self.states[next_state]
        return next_matrix, next_state
    
    def apply_rotation(self):
        # 应用旋转状态
        self.state = (self.state + 1) % len(self.states)
        self.matrix = self.states[self.state]

    def draw(self, surface, offset_x, offset_y):
        # 将方块绘制到指定表面上，offset_x/offset_y为像素坐标偏移
        for i, row in enumerate(self.matrix):
            for j, cell in enumerate(row):
                if cell:
                    px = offset_x + (self.x + j) * CELL_SIZE
                    py = offset_y + (self.y + i) * CELL_SIZE
                    pygame.draw.rect(surface, self.color, (px, py, CELL_SIZE, CELL_SIZE))
                    # 方块边框
                    pygame.draw.rect(surface, (60, 60, 60), (px, py, CELL_SIZE, CELL_SIZE), 1)

# ---------- 主游戏区棋盘定义与操作 ----------
def create_board():
    # 创建主游戏区的空棋盘矩阵
    return [[None for _ in range(COLUMNS)] for _ in range(ROWS)]

# 检查方块是否可以放置（不碰撞和不越界）
def valid_move(board, tetromino, x_move=0, y_move=0, rotation=False):
    matrix = tetromino.matrix
    x = tetromino.x + x_move
    y = tetromino.y + y_move
    if rotation:
        matrix, _ = tetromino.rotate()
    for i, row in enumerate(matrix):
        for j, cell in enumerate(row):
            if cell:
                xi = x + j
                yi = y + i
                if xi < 0 or xi >= COLUMNS or yi < 0 or yi >= ROWS:
                    return False
                if yi >= 0 and board[yi][xi]:
                    return False
    return True

# 将方块添加到棋盘
def place_tetromino(board, tetromino):
    for i, row in enumerate(tetromino.matrix):
        for j, cell in enumerate(row):
            if cell:
                xi = tetromino.x + j
                yi = tetromino.y + i
                if 0 <= yi < ROWS and 0 <= xi < COLUMNS:
                    board[yi][xi] = tetromino.color

# 消除与得分功能实现
score = 0  # 全局分数变量

# 检测并消除棋盘中填满的整行，返回消除行数
# （"实现消除与得分规则"）
def clear_lines(board):
    global score
    full_rows = []
    for i in range(ROWS):
        if all(board[i][j] for j in range(COLUMNS)):
            full_rows.append(i)
    for i in full_rows:
        del board[i]
        board.insert(0, [None for _ in range(COLUMNS)])  # 上方补空行
    # 得分规则：每消除一行加100分
    lines_cleared = len(full_rows)
    if lines_cleared > 0:
        score += lines_cleared * 100
    return lines_cleared

# 判断游戏是否结束（无法生成新方块时）
def check_game_over(board, next_tetromino):
    # 判断next_tetromino出现在初始位置时是否立即重叠
    for i, row in enumerate(next_tetromino.matrix):
        for j, cell in enumerate(row):
            if cell:
                xi = next_tetromino.x + j
                yi = next_tetromino.y + i
                if 0 <= xi < COLUMNS and 0 <= yi < ROWS:
                    if board[yi][xi]:
                        return True
    return False

# 绘制整个棋盘中的已堆放方块
def draw_board(surface, board, offset_x, offset_y):
    for i in range(ROWS):
        for j in range(COLUMNS):
            color = board[i][j]
            if color:
                px = offset_x + j * CELL_SIZE
                py = offset_y + i * CELL_SIZE
                pygame.draw.rect(surface, color, (px, py, CELL_SIZE, CELL_SIZE))
                pygame.draw.rect(surface, (60, 60, 60), (px, py, CELL_SIZE, CELL_SIZE), 1)
    # 绘制主游戏区边框
    pygame.draw.rect(surface, (180,180,180), (offset_x, offset_y, GAME_AREA_WIDTH, GAME_AREA_HEIGHT), 3)

# 绘制分数
font = pygame.font.SysFont("Arial", 28)
def draw_score():
    score_text = font.render(f"得分: {score}", True, (255,255,255))
    screen.blit(score_text, (SCORE_AREA_X, SCORE_AREA_Y))

# 绘制游戏结束信息
end_font = pygame.font.SysFont("Arial", 38, bold=True)
def draw_gameover():
    text = end_font.render("游戏结束!", True, (255,100,100))
    rect = text.get_rect(center=(WINDOW_WIDTH//2, WINDOW_HEIGHT//2))
    screen.blit(text, rect)

# -------------------- 游戏主循环开始前伪代码 --------------------
# 初始化主游戏区棋盘
board = create_board()
# 随机生成首个方块和下一个方块
current_tetromino = Tetromino(random.choice(list(SHAPES.keys())))
next_tetromino = Tetromino(random.choice(list(SHAPES.keys())))

game_over = False

def reset_game():
    global board, score, current_tetromino, next_tetromino, game_over
    board = create_board()
    score = 0
    current_tetromino = Tetromino(random.choice(list(SHAPES.keys())))
    next_tetromino = Tetromino(random.choice(list(SHAPES.keys())))
    game_over = False

# ----------- 响应用户输入实现方块移动和旋转 ----------
def handle_input(board, tetromino, event):
    if event.type == pygame.KEYDOWN and not game_over:
        # 左移
        if event.key == pygame.K_LEFT:
            if valid_move(board, tetromino, x_move=-1):
                tetromino.x -= 1
        # 右移
        elif event.key == pygame.K_RIGHT:
            if valid_move(board, tetromino, x_move=1):
                tetromino.x += 1
        # 下移（加速下落）
        elif event.key == pygame.K_DOWN:
            if valid_move(board, tetromino, y_move=1):
                tetromino.y += 1
        # 旋转
        elif event.key == pygame.K_UP:
            if valid_move(board, tetromino, rotation=True):
                tetromino.apply_rotation()
    # 支持R键重启
    if event.type == pygame.KEYDOWN:
        if event.key == pygame.K_r:
            reset_game()
    # 鼠标按钮点击的处理见主循环（用于按钮）

# ----------- 自动下落逻辑（每隔一定时间） -----------
drop_event = pygame.USEREVENT + 1
pygame.time.set_timer(drop_event, 500)  # 每500ms下落一次

def move_down(board, tetromino):
    if valid_move(board, tetromino, y_move=1):
        tetromino.y += 1
        return True
    else:
        # 不能下落，需要堆叠
        place_tetromino(board, tetromino)
        return False

# 绘制下一个方块
small_cell = CELL_SIZE // 2
def draw_next_tetromino():
    # 在NEXT_AREA_X, NEXT_AREA_Y显示next_tetromino
    mx = next_tetromino.matrix
    for i, row in enumerate(mx):
        for j, cell in enumerate(row):
            if cell:
                px = NEXT_AREA_X + j * small_cell
                py = NEXT_AREA_Y + i * small_cell
                pygame.draw.rect(screen, next_tetromino.color, (px, py, small_cell, small_cell))
                pygame.draw.rect(screen, (60, 60, 60), (px, py, small_cell, small_cell), 1)
    # 标题
    next_txt = font.render('下一个：', True, (220,220,220))
    screen.blit(next_txt, (NEXT_AREA_X, NEXT_AREA_Y - 34))

# ------------------- 主界面按钮 -----------------
btn_font = pygame.font.SysFont("Arial", 24, bold=False)
class Button:
    def __init__(self, txt, x, y, w, h):
        self.txt = txt
        self.x, self.y, self.w, self.h = x, y, w, h
        self.rect = pygame.Rect(x, y, w, h)
        self.active = False
    def draw(self, surf):
        color = (70,200,150) if self.active else (120,120,120)
        pygame.draw.rect(surf, color, self.rect, border_radius=8)
        txt_render = btn_font.render(self.txt, True, (15,15,15))
        txt_rect = txt_render.get_rect(center=self.rect.center)
        surf.blit(txt_render, txt_rect)
# 按钮实例
BTN_WIDTH, BTN_HEIGHT = 88, 38
start_btn = Button("开始", WINDOW_WIDTH-130, GAME_AREA_Y, BTN_WIDTH, BTN_HEIGHT)
pause_btn = Button("暂停", WINDOW_WIDTH-130, GAME_AREA_Y+BTN_HEIGHT+18, BTN_WIDTH, BTN_HEIGHT)
restart_btn = Button("重启", WINDOW_WIDTH-130, GAME_AREA_Y+2*(BTN_HEIGHT+18), BTN_WIDTH, BTN_HEIGHT)

# ------------------- 界面绘制测试 -------------------
def draw_all():
    screen.fill((33, 33, 33))  # 背景
    draw_board(screen, board, GAME_AREA_X, GAME_AREA_Y)  # 绘制当前棋盘
    if not game_over:
        current_tetromino.draw(screen, GAME_AREA_X, GAME_AREA_Y)  # 绘制当前活动方块
    draw_score()
    draw_next_tetromino()
    start_btn.draw(screen)
    pause_btn.draw(screen)
    restart_btn.draw(screen)
    if game_over:
        draw_gameover()
    pygame.display.flip()

# ------------------ 游戏状态控制变量 ----------------
game_running = True  # 游戏主循环进行中
paused = False    # 是否暂停

def set_btn_state():
    # 按钮高亮设置，与状态相关
    start_btn.active = (not paused) and (not game_over)
    pause_btn.active = paused and not game_over
    restart_btn.active = True

# ------------------ 示例事件循环框架（主游戏循环） -------------------
while game_running:
    set_btn_state()
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            game_running = False
        # 键盘与重启响应
        handle_input(board, current_tetromino, event)
        # 按钮鼠标检测
        if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            mx, my = event.pos
            if start_btn.rect.collidepoint(mx, my) and not game_over:
                paused = False
            elif pause_btn.rect.collidepoint(mx, my) and not game_over:
                paused = True
            elif restart_btn.rect.collidepoint(mx, my):
                reset_game()
        # 方块自动下落定时器（只有在未暂停且未结束）
        if event.type == drop_event and not paused and not game_over:
            if not move_down(board, current_tetromino):
                # 方块已堆叠到顶部，消除行并生成新方块
                clear_lines(board)
                # 切换到下一个方块
                current_tetromino = next_tetromino
                next_tetromino = Tetromino(random.choice(list(SHAPES.keys())))
                # 生成新方块后立即判断是否游戏结束
                if check_game_over(board, current_tetromino):
                    game_over = True

    draw_all()
    clock.tick(FPS)

pygame.quit()
sys.exit()
