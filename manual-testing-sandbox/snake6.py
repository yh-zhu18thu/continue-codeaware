# 导入pygame及其它必要库
import pygame
import sys  # 用于系统退出
import random  # 可能用于后续食物生成

# 初始化pygame及窗口设置
pygame.init()  # 初始化pygame所有模块

# 设置窗口尺寸
WINDOW_WIDTH = 600
WINDOW_HEIGHT = 400

# 创建游戏窗口
window = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
pygame.display.set_caption('贪吃蛇')  # 设置窗口标题

# ----------- 新增：自定义窗口背景颜色 -----------
# 可以自定义背景色，例如使用深灰色，让蛇与背景更分明
BACKGROUND_COLOR = (30, 30, 30)  # 深灰色，RGB值
# --------------------------------------------

# ----------- 新增：设计开始界面 -----------
# 标志位：是否显示开始界面
show_start_screen = True

# 使用pygame字体模块来绘制文字
font_title = pygame.font.SysFont('simhei', 48)  # 标题字体
font_info = pygame.font.SysFont('simhei', 24)   # 信息字体

def draw_start_screen(surface):
    """
    绘制游戏开始界面，显示欢迎语和提示按键。
    """
    surface.fill(BACKGROUND_COLOR)  # 填充背景
    # 欢迎文字
    title_surf = font_title.render('欢迎来到贪吃蛇！', True, (0, 220, 0))
    title_rect = title_surf.get_rect(center=(WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2 - 40))
    surface.blit(title_surf, title_rect)
    # 游戏玩法提示
    info_lines = [
        '玩法: 使用方向键控制蛇移动',
        '吃掉食物可变长，撞墙/咬自己则游戏结束',
        '按 空格键 开始游戏',
        'Esc 键可直接退出'
    ]
    for i, txt in enumerate(info_lines):
        info_surf = font_info.render(txt, True, (200, 200, 200))
        info_rect = info_surf.get_rect(center=(WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2 + 30 + i * 30))
        surface.blit(info_surf, info_rect)

# --------------------------------------------

# 设置游戏主循环
running = True  # 控制主循环的标志位

while running:
    # 事件处理：如果在开始界面，则只处理退出和开始游戏键
    for event in pygame.event.get():
        if event.type == pygame.QUIT:  # 点击窗口关闭按钮
            running = False
        if show_start_screen:
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    running = False
                elif event.key == pygame.K_SPACE:
                    show_start_screen = False  # 按空格键开始游戏
    
    # 绘制界面，根据当前状态
    if show_start_screen:
        # 游戏未开始，显示开始界面
        draw_start_screen(window)
    else:
        # 绘制背景色，每帧都刷新，作为活动区域的"地板"
        window.fill(BACKGROUND_COLOR)  # 使用自定义背景色填充窗口
        # 后续贪吃蛇主游戏代码位置
        # TODO: 这里将来补充贪吃蛇游戏逻辑

    # 更新显示内容
    pygame.display.flip()

# 退出pygame和程序
pygame.quit()
sys.exit()
