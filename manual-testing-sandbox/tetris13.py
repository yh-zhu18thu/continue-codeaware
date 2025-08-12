# 导入必需的包
import pygame  # PyGame库是游戏开发的基础
import random  # 随机库，后续生成随机方块等会用到

# 初始化PyGame
pygame.init()

# 设置窗口参数
WINDOW_WIDTH = 300  # 窗口宽度
WINDOW_HEIGHT = 600  # 窗口高度
GRID_SIZE = 30  # 每个格子的边长（像素）
GRID_WIDTH = WINDOW_WIDTH // GRID_SIZE  # 水平方块数
GRID_HEIGHT = WINDOW_HEIGHT // GRID_SIZE  # 垂直方块数

# 创建游戏窗口，并设置标题
screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
pygame.display.set_caption("俄罗斯方块 - Pygame")
# 可选：设置窗口图标
# icon = pygame.image.load('icon.png')
# pygame.display.set_icon(icon)

# 定义主函数和主循环框架

def main():
    running = True
    clock = pygame.time.Clock()  # 控制帧率

    # 游戏主循环
    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False

        # 清屏（填充背景色）
        screen.fill((0, 0, 0))  # 黑色背景

        # TODO: 这里将来绘制游戏内容（后续步骤实现）

        pygame.display.flip()  # 刷新窗口显示
        clock.tick(60)  # 控制循环帧率为60 FPS

    pygame.quit()

# 程序入口
if __name__ == "__main__":
    main()
