import pygame
import random

# Step 1: 定义全局参数常量
WIDTH, HEIGHT = 800, 600
NUM_BOIDS = 50
VIEW_RADIUS = 50
PROTECTED_RANGE = 20
AVOID_FACTOR = 0.05
MATCH_FACTOR = 0.05
CENTER_FACTOR = 0.0005
MAX_SPEED = 5
MIN_SPEED = 2


# Step 3: 定义Boid的位置与速度字段
class Boid:
    def __init__(self):
        # Step 4: 随机生成初始群体状态
        self.pos = pygame.Vector2(random.uniform(0, WIDTH), random.uniform(0, HEIGHT))
        self.vel = pygame.Vector2(
            random.uniform(-MAX_SPEED, MAX_SPEED),
            random.uniform(-MAX_SPEED, MAX_SPEED),
        )

    def update(self, boids):
        # Step 5: 统计邻居并计算分离向量
        sep = pygame.Vector2(0, 0)
        # Step 6: 计算对齐与聚合目标
        ali = pygame.Vector2(0, 0)
        coh = pygame.Vector2(0, 0)
        neighbors = 0

        for other in boids:
            if other is self:
                continue

            dist = self.pos.distance_to(other.pos)
            if dist < VIEW_RADIUS:
                if dist < PROTECTED_RANGE:
                    sep += (self.pos - other.pos)
                ali += other.vel
                coh += other.pos
                neighbors += 1

        if neighbors > 0:
            ali /= neighbors
            coh /= neighbors
            # Step 7: 按系数更新速度向量
            self.vel += (ali - self.vel) * MATCH_FACTOR
            self.vel += (coh - self.pos) * CENTER_FACTOR

        self.vel += sep * AVOID_FACTOR

        # Step 8: 限制速度到最小最大范围
        speed = self.vel.length()
        if speed > MAX_SPEED:
            self.vel.scale_to_length(MAX_SPEED)
        elif speed < MIN_SPEED:
            self.vel.scale_to_length(MIN_SPEED)

        # Step 9: 推进位置并处理边界循环
        self.pos += self.vel
        self.pos.x %= WIDTH
        self.pos.y %= HEIGHT

    # Step 10: 绘制每只鸟为小圆点
    def draw(self, screen):
        pygame.draw.circle(
            screen,
            (200, 200, 255),
            (int(self.pos.x), int(self.pos.y)),
            3,
        )


def main():
    # Step 2: 初始化Pygame显示环境
    pygame.init()
    screen = pygame.display.set_mode((WIDTH, HEIGHT))
    pygame.display.set_caption("Boids 群鸟仿真模拟")
    clock = pygame.time.Clock()

    # Step 4: 随机生成初始群体状态
    boids = [Boid() for _ in range(NUM_BOIDS)]

    running = True
    while running:
        # Step 11: 处理退出事件并清屏刷新
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False

        screen.fill((30, 30, 35))

        for boid in boids:
            boid.update(boids)
            boid.draw(screen)

        pygame.display.flip()

        # Step 12: 控制帧率并收尾退出Pygame
        clock.tick(60)

    pygame.quit()


if __name__ == "__main__":
    main()