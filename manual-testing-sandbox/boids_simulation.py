import pygame
import random

# Step 2: 设置速度、距离等参数
WIDTH, HEIGHT = 800, 600
NUM_BOIDS = 50
VIEW_RADIUS = 50
PROTECTED_RANGE = 20
AVOID_FACTOR = 0.05
MATCH_FACTOR = 0.05
CENTER_FACTOR = 0.0005
MAX_SPEED = 5
MIN_SPEED = 2

# Step 1: 定义鸟群行为规则（Boid类）
class Boid:
    def __init__(self):
        self.pos = pygame.Vector2(random.uniform(0, WIDTH), random.uniform(0, HEIGHT))
        self.vel = pygame.Vector2(random.uniform(-MAX_SPEED, MAX_SPEED), random.uniform(-MAX_SPEED, MAX_SPEED))

    # Step 3/4: 实现位置和速度动态更新 & 边界循环与群体碰撞
    def update(self, boids):
        sep = pygame.Vector2(0, 0)
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
            self.vel += (ali - self.vel) * MATCH_FACTOR
            self.vel += (coh - self.pos) * CENTER_FACTOR
        self.vel += sep * AVOID_FACTOR

        speed = self.vel.length()
        if speed > MAX_SPEED:
            self.vel.scale_to_length(MAX_SPEED)
        if speed < MIN_SPEED:
            self.vel.scale_to_length(MIN_SPEED)
        self.pos += self.vel
        # Step 4: 处理边界循环
        self.pos.x %= WIDTH
        self.pos.y %= HEIGHT

    # Step 5: 绘制鸟群动画效果
    def draw(self, screen):
        pygame.draw.circle(screen, (200, 200, 255), (int(self.pos.x), int(self.pos.y)), 3)

# Step 6: 搭建持续动画循环

def main():
    pygame.init()
    screen = pygame.display.set_mode((WIDTH, HEIGHT))
    pygame.display.set_caption("Boids 群鸟仿真模拟")
    clock = pygame.time.Clock()
    boids = [Boid() for _ in range(NUM_BOIDS)]
    running = True
    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
        screen.fill((30, 30, 35))
        for boid in boids:
            boid.update(boids)
            boid.draw(screen)
        pygame.display.flip()
        clock.tick(60)
    pygame.quit()

if __name__ == "__main__":
    main()
