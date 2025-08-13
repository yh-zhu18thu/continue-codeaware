import pygame
import random
import math

# =====================
# 步骤1：导入必要的包并初始化PyGame
# =====================

# 初始化pygame
pygame.init()

# 屏幕参数
WIDTH, HEIGHT = 800, 600
WINDOW = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Boids 群鸟模拟")

# 颜色配置
BG_COLOR = (30, 30, 30)  # 背景色
BOID_COLOR = (200, 200, 255)

# =====================
# 步骤2：设定主循环与帧率控制
# =====================

FPS = 60
clock = pygame.time.Clock()

# =====================
# 步骤3：定义Boid类并初始化群体
# =====================

class Boid:
    def __init__(self, x, y, vx, vy, perception=50):
        self.pos = pygame.math.Vector2(x, y)
        self.vel = pygame.math.Vector2(vx, vy)
        self.perception = perception  # 感知范围
        self.max_speed = 4  # 最大速度（初始设置，可后续调整）

    def move(self):
        # 更新位置
        self.pos += self.vel
        # 环绕地图边界判断
        if self.pos.x < 0:
            self.pos.x += WIDTH
        elif self.pos.x > WIDTH:
            self.pos.x -= WIDTH
        if self.pos.y < 0:
            self.pos.y += HEIGHT
        elif self.pos.y > HEIGHT:
            self.pos.y -= HEIGHT

    def update(self):
        self.move()
        # 目前未实现更多行为规则

    def draw(self, surface):
        # 简化为圆形显示（可替换为三角形等鸟形状）
        pygame.draw.circle(surface, BOID_COLOR, (int(self.pos.x), int(self.pos.y)), 5)

# Boid群体初始化
NUM_BOIDS = 30
boids = []
for _ in range(NUM_BOIDS):
    x = random.uniform(0, WIDTH)
    y = random.uniform(0, HEIGHT)
    angle = random.uniform(0, 2 * math.pi)
    speed = random.uniform(2, 4)
    vx = math.cos(angle) * speed
    vy = math.sin(angle) * speed
    boids.append(Boid(x, y, vx, vy))

# =====================
# 主游戏循环
# =====================

running = True
while running:
    clock.tick(FPS)  # 帧率控制
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False

    WINDOW.fill(BG_COLOR)

    # 更新与绘制所有Boids
    for boid in boids:
        boid.update()
        boid.draw(WINDOW)

    pygame.display.flip()

pygame.quit()
