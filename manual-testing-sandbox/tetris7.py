# 导入PyGame及其它必要模块（步骤s-1）
import pygame  # 导入PyGame模块
import sys      # 导入sys模块用于系统相关操作
import random   # 导入random模块以支持随机方块生成

# 初始化PyGame并设置游戏窗口（步骤s-2）
pygame.init()  # 初始化PyGame

# 定义窗口大小
WINDOW_WIDTH = 300
WINDOW_HEIGHT = 600

# 游戏区域设置（俄罗斯方块一般为10列20行，每格30像素）
GRID_WIDTH = 10
GRID_HEIGHT = 20
CELL_SIZE = WINDOW_WIDTH // GRID_WIDTH

# 创建游戏窗口
screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
# 设置窗口标题
pygame.display.set_caption("俄罗斯方块 - PyGame版")

# 步骤s-4: 定义方块形状及其固定颜色
# 定义7种俄罗斯方块形状（每种用嵌套列表表示）
SHAPES = {
    # I型
    "I": [
        [1, 1, 1, 1]
    ],
    # O型
    "O": [
        [1, 1],
        [1, 1]
    ],
    # T型
    "T": [
        [0, 1, 0],
        [1, 1, 1]
    ],
    # S型
    "S": [
        [0, 1, 1],
        [1, 1, 0]
    ],
    # Z型
    "Z": [
        [1, 1, 0],
        [0, 1, 1]
    ],
    # J型
    "J": [
        [1, 0, 0],
        [1, 1, 1]
    ],
    # L型
    "L": [
        [0, 0, 1],
        [1, 1, 1]
    ]
}

# 每种方块固定颜色映射（RGB元组）
SHAPE_COLORS = {
    "I": (0, 255, 255),    # 青色
    "O": (255, 255, 0),    # 黄色
    "T": (128, 0, 128),    # 紫色
    "S": (0, 255, 0),      # 绿色
    "Z": (255, 0, 0),      # 红色
    "J": (0, 0, 255),      # 蓝色
    "L": (255, 165, 0)     # 橙色
}

# 步骤s-5: 初始化游戏地图和下一块队列
# 游戏地图 - 20行x10列，每个格子存放颜色（None表示空白）
grid = [[None for _ in range(GRID_WIDTH)] for _ in range(GRID_HEIGHT)]

# 下一块队列（这里用变量记录下一块形状）
next_shape_type = random.choice(list(SHAPES.keys()))    # 随机选一个形状作为下一块

# 步骤s-6: 生成新方块并随机选取形状颜色
# 当前活跃方块数据结构（字典：形状、颜色、坐标）
def create_new_piece():
    global next_shape_type
    shape_type = next_shape_type                    # 用下一块类型
    shape = SHAPES[shape_type]
    color = SHAPE_COLORS[shape_type]
    # 下一个next_shape_type
    next_shape_type = random.choice(list(SHAPES.keys()))
    # 初始位置：一般顶部水平居中
    x = GRID_WIDTH // 2 - len(shape[0]) // 2
    y = 0
    piece = {
        "shape_type": shape_type,
        "shape": shape,
        "color": color,
        "x": x,
        "y": y
    }
    return piece

# 当前控制的方块（刚出生一块）
current_piece = create_new_piece()

# 步骤s-7: 实现方块下落与自然移动
fall_time = 0                      # 用于记录下落时间间隔（毫秒）
fall_speed = 500                   # 下落速度：每隔500毫秒自动向下

# 辅助函数：判断方块是否可以放置到目标位置
def is_valid_position(piece, adj_x=0, adj_y=0, adj_shape=None):
    shape = adj_shape if adj_shape is not None else piece["shape"]
    for row_idx, row in enumerate(shape):
        for col_idx, cell in enumerate(row):
            if cell:
                x = piece["x"] + col_idx + adj_x
                y = piece["y"] + row_idx + adj_y
                if x < 0 or x >= GRID_WIDTH or y < 0 or y >= GRID_HEIGHT:
                    return False
                if grid[y][x] is not None:
                    return False
    return True

# 步骤s-8: 实现玩家控制的移动和旋转
# 方块旋转函数（顺时针旋转）
def rotate_piece(piece):
    shape = piece["shape"]
    # 矩阵转置+逆序
    rotated = [list(row) for row in zip(*shape[::-1])]
    return rotated

# 设置主循环与帧率控制（步骤s-3）
clock = pygame.time.Clock()       # 创建时钟对象用于帧率控制
FPS = 60                         # 帧率设置为60

running = True
while running:
    # 记录帧间隔时间
    dt = clock.get_time()
    fall_time += dt
    
    # 事件监听
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_LEFT:
                # 左移
                if is_valid_position(current_piece, adj_x=-1):
                    current_piece["x"] -= 1
            elif event.key == pygame.K_RIGHT:
                # 右移
                if is_valid_position(current_piece, adj_x=1):
                    current_piece["x"] += 1
            elif event.key == pygame.K_DOWN:
                # 快速下降
                if is_valid_position(current_piece, adj_y=1):
                    current_piece["y"] += 1
                    fall_time = 0 # 立即刷新下落速度
            elif event.key == pygame.K_UP:
                # 旋转
                rotated_shape = rotate_piece(current_piece)
                if is_valid_position(current_piece, adj_shape=rotated_shape):
                    current_piece["shape"] = rotated_shape
    
    # 方块自然下落，每隔fall_speed毫秒向下移动一格
    if fall_time >= fall_speed:
        if is_valid_position(current_piece, adj_y=1):
            current_piece["y"] += 1
        fall_time = 0

    # 游戏逻辑处理（后续步骤添加）

    # 界面绘制（后续步骤添加）
    screen.fill((0, 0, 0))   # 填充为黑色背景
    
    # 更新显示
    pygame.display.flip()
    
    # 控制帧率
    clock.tick(FPS)

# 退出PyGame
pygame.quit()
sys.exit()
