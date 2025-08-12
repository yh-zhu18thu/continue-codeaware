# 导入 PyGame 及其他必要库
import pygame
import sys
import random

# 初始化 PyGame 和设置窗口
pygame.init()

# 游戏主参数与界面尺寸
BLOCK_SIZE = 30  # 单个方块像素大小
GRID_WIDTH = 10  # 网格列数
GRID_HEIGHT = 20  # 网格行数
SCREEN_WIDTH = BLOCK_SIZE * GRID_WIDTH
SCREEN_HEIGHT = BLOCK_SIZE * GRID_HEIGHT

# 设置窗口与标题
game_screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
pygame.display.set_caption('俄罗斯方块 Tetris')

# 颜色定义
WHITE = (255, 255, 255)
GRAY = (128, 128, 128)
BLACK = (0, 0, 0)

# 每种形状对应的颜色（RGB）
TETROMINO_COLORS = {
    'I': (0, 255, 255),   # 青色
    'O': (255, 255, 0),   # 黄色
    'T': (128, 0, 128),   # 紫色
    'S': (0, 255, 0),     # 绿色
    'Z': (255, 0, 0),     # 红色
    'J': (0, 0, 255),     # 蓝色
    'L': (255, 165, 0),   # 橙色
}

# 绘制游戏背景与网格
def draw_background_and_grid(surface):
    surface.fill(BLACK)  # 填充背景色
    # 绘制竖线
    for x in range(GRID_WIDTH + 1):
        pygame.draw.line(surface, GRAY, (x * BLOCK_SIZE, 0), (x * BLOCK_SIZE, SCREEN_HEIGHT))
    # 绘制横线
    for y in range(GRID_HEIGHT + 1):
        pygame.draw.line(surface, GRAY, (0, y * BLOCK_SIZE), (SCREEN_WIDTH, y * BLOCK_SIZE))

# 定义所有类型的俄罗斯方块和对应形状
# 每种方块用 4x4 矩阵描述（1为填充，0为空）
TETROMINOS = {
    'I': [
        [
            [0, 0, 0, 0],
            [1, 1, 1, 1],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
        ]
    ],
    'O': [
        [
            [0, 1, 1, 0],
            [0, 1, 1, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
        ]
    ],
    'T': [
        [
            [0, 1, 0, 0],
            [1, 1, 1, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
        ]
    ],
    'S': [
        [
            [0, 1, 1, 0],
            [1, 1, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
        ]
    ],
    'Z': [
        [
            [1, 1, 0, 0],
            [0, 1, 1, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
        ]
    ],
    'J': [
        [
            [1, 0, 0, 0],
            [1, 1, 1, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
        ]
    ],
    'L': [
        [
            [0, 0, 1, 0],
            [1, 1, 1, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
        ]
    ],
}

# 步骤 s-9: 网格需能保存类型和颜色信息
# 网格使用二维数组，每个元素为 None（空）或 (类型标识, 颜色)
grid = [[None for _ in range(GRID_WIDTH)] for _ in range(GRID_HEIGHT)]

# 步骤 s-6、s-7、s-8: 方块类，负责下落、移动、旋转及颜色绑定
def rotate_shape(shape_matrix):
    """顺时针旋转一个4x4矩阵"""
    return [list(row) for row in zip(*shape_matrix[::-1])]

class Tetromino:
    def __init__(self, shape_type):
        self.shape_type = shape_type  # 类型字符
        self.color = TETROMINO_COLORS[shape_type]
        # 旋转状态（只从0-3）
        self.shape_matrix = TETROMINOS[shape_type][0]
        self.x = GRID_WIDTH // 2 - 2  # 4x4形状居中靠顶部
        self.y = 0

    def get_cells(self, offset_x=0, offset_y=0, shape_matrix=None):
        """获取当前方块占据的所有网格坐标"""
        cells = []
        shape = shape_matrix if shape_matrix else self.shape_matrix
        for i in range(4):
            for j in range(4):
                if shape[i][j]:
                    cells.append((self.x + j + offset_x, self.y + i + offset_y))
        return cells

    def can_move(self, dx, dy, grid_data, shape_matrix=None):
        """判断移动/旋转是否合法"""
        for x, y in self.get_cells(dx, dy, shape_matrix):
            if x < 0 or x >= GRID_WIDTH or y < 0 or y >= GRID_HEIGHT:
                return False
            if grid_data[y][x]:  # 网格中已有方块
                return False
        return True

    def move(self, dx, dy, grid_data):
        if self.can_move(dx, dy, grid_data):
            self.x += dx
            self.y += dy
            return True
        return False

    def rotate(self, grid_data):
        rotated = rotate_shape(self.shape_matrix)
        if self.can_move(0, 0, grid_data, rotated):
            self.shape_matrix = rotated
            return True
        return False

# s-7/s-9辅助函数: 固定方块到网格
def place_tetromino_to_grid(tetromino, grid_data):
    for x, y in tetromino.get_cells():
        if 0 <= y < GRID_HEIGHT and 0 <= x < GRID_WIDTH:
            # 保存类型和颜色
            grid_data[y][x] = (tetromino.shape_type, tetromino.color)

# s-10: 检测满行并消除
def clear_full_lines(grid_data):
    full_lines = []
    for y in range(GRID_HEIGHT):
        if all(grid_data[y][x] for x in range(GRID_WIDTH)):
            full_lines.append(y)
    # 将满行消除，上方整体下移
    for y in full_lines:
        del grid_data[y]
        grid_data.insert(0, [None for _ in range(GRID_WIDTH)])
    return len(full_lines)  # 返回消除行数，可用于记分

# 步骤 s-9: 绘制网格中已落地方块（保持原颜色）
def draw_fixed_blocks(surface, grid_data):
    for y in range(GRID_HEIGHT):
        for x in range(GRID_WIDTH):
            cell = grid_data[y][x]
            if cell:
                _, color = cell
                rect = pygame.Rect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE)
                pygame.draw.rect(surface, color, rect)
                pygame.draw.rect(surface, GRAY, rect, 1)  # 方块边框

# 步骤 s-6: 绘制当前移动的方块（根据类型颜色）
def draw_tetromino(surface, tetromino):
    color = tetromino.color
    for x, y in tetromino.get_cells():
        if 0 <= x < GRID_WIDTH and 0 <= y < GRID_HEIGHT:
            rect = pygame.Rect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE)
            pygame.draw.rect(surface, color, rect)
            pygame.draw.rect(surface, GRAY, rect, 1)

# 步骤 s-7: 新方块生成与落地判定
def create_new_tetromino():
    """生成新的方块对象"""
    shape_type = random.choice(list(TETROMINOS.keys()))
    return Tetromino(shape_type)

def is_game_over(tetromino, grid_data):
    """判定：新方块初始位置有重叠则游戏结束"""
    for x, y in tetromino.get_cells():
        if 0 <= x < GRID_WIDTH and 0 <= y < GRID_HEIGHT:
            if grid_data[y][x]:
                return True
    return False

# 主游戏循环实现及事件处理（包括s-11）
if __name__ == "__main__":
    clock = pygame.time.Clock()
    drop_time = 0  # 用于方块自动下落计时
    drop_interval = 600  # 毫秒, 可后续随难度调整
    current_tetromino = create_new_tetromino()
    score = 0
    gameover = False

    while True:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            # 步骤 s-11: 键盘响应移动与旋转等
            if not gameover and event.type == pygame.KEYDOWN:
                if event.key == pygame.K_LEFT:
                    current_tetromino.move(-1, 0, grid)
                elif event.key == pygame.K_RIGHT:
                    current_tetromino.move(1, 0, grid)
                elif event.key == pygame.K_DOWN:
                    # 向下加速落下
                    if not current_tetromino.move(0, 1, grid):
                        # 无法下落，直接固定
                        place_tetromino_to_grid(current_tetromino, grid)
                        cleared = clear_full_lines(grid)
                        score += cleared * 100  # 简单得分逻辑
                        current_tetromino = create_new_tetromino()
                        if is_game_over(current_tetromino, grid):
                            gameover = True
                elif event.key == pygame.K_UP:
                    current_tetromino.rotate(grid)
                elif event.key == pygame.K_SPACE:
                    # 快速下落到底
                    while current_tetromino.move(0, 1, grid):
                        pass
                    place_tetromino_to_grid(current_tetromino, grid)
                    cleared = clear_full_lines(grid)
                    score += cleared * 100
                    current_tetromino = create_new_tetromino()
                    if is_game_over(current_tetromino, grid):
                        gameover = True

        # 步骤 s-6: 自动下落逻辑
        if not gameover:
            drop_time += clock.get_time()
            if drop_time > drop_interval:
                if current_tetromino.move(0, 1, grid):
                    pass
                else:
                    place_tetromino_to_grid(current_tetromino, grid)
                    cleared = clear_full_lines(grid)
                    score += cleared * 100
                    current_tetromino = create_new_tetromino()
                    if is_game_over(current_tetromino, grid):
                        gameover = True
                drop_time = 0

        # 绘制所有场景
        draw_background_and_grid(game_screen)
        draw_fixed_blocks(game_screen, grid)  # 步骤 s-9
        if not gameover:
            draw_tetromino(game_screen, current_tetromino)  # s-6,s-8 按类型颜色绘制当前方块
        # 游戏结束提示
        if gameover:
            font = pygame.font.SysFont(None, 48)
            text = font.render('游戏结束', True, WHITE)
            game_screen.blit(text, ((SCREEN_WIDTH-text.get_width())//2, SCREEN_HEIGHT//2-30))
        # 显示分数
        font = pygame.font.SysFont(None, 28)
        score_text = font.render(f'分数: {score}', True, WHITE)
        game_screen.blit(score_text, (10, 10))
        pygame.display.update()
        clock.tick(60)
