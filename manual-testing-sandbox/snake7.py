# 导入pygame库并进行初始化
import pygame

# 初始化pygame各模块
pygame.init()

# 设置窗口尺寸与游戏标题
WINDOW_WIDTH = 600  # 窗口宽度
WINDOW_HEIGHT = 400 # 窗口高度
window = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))  # 创建游戏窗口
pygame.display.set_caption('贪吃蛇小游戏')  # 设置窗口标题

# 定义颜色（RGB格式）
BLACK = (0, 0, 0)           # 背景色
GREEN = (0, 255, 0)         # 蛇的颜色
RED = (255, 0, 0)           # 食物颜色
WHITE = (255, 255, 255)     # 文字或辅助色

# 帧率控制，避免游戏运行过快或过慢
FPS = 29                    # 每秒刷新次数，控制游戏速度
clock = pygame.time.Clock() # 创建时钟对象用于帧率控制

# --- 新增部分：创建蛇和食物的数据结构 ---

SNAKE_BLOCK_SIZE = 20  # 蛇身和食物的单元格尺寸

# 初始化蛇的身体：用列表表示，每个元素为(x, y)坐标
snake_body = [
    [WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2],  # 起点在屏幕中心
]

# 初始化食物位置：用列表表示为(x, y)坐标
import random

food_position = [
    random.randrange(0, WINDOW_WIDTH // SNAKE_BLOCK_SIZE) * SNAKE_BLOCK_SIZE,
    random.randrange(0, WINDOW_HEIGHT // SNAKE_BLOCK_SIZE) * SNAKE_BLOCK_SIZE
]

# 此处已经建立好蛇身及食物的基础数据结构，后续可基于此实现移动、增长等功能。
