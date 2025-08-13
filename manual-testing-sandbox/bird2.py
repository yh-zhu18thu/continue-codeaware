import pygame
import random
import math

# =============================
# 基本参数与初始化
# =============================

WIDTH, HEIGHT = 960, 720       # 地图尺寸
BG_COLOR = (35, 35, 45)        # 背景色
BOID_COLOR = (220, 210, 80)    # Boid颜色
OBSTACLE_COLOR = (255, 60, 60) # 障碍物颜色
FPS = 60                       # 帧率控制

BOID_RADIUS = 5                # Boid显示半径
OBSTACLE_RADIUS = 30           # 障碍物半径
NUM_OBSTACLES = 7              # 障碍物数量

# 群体规则参数
MAX_SPEED = 4
MAX_FORCE = 0.08
SEPARATION_RADIUS = 32
ALIGNMENT_RADIUS = 64
COHESION_RADIUS = 64
SEPARATION_WEIGHT = 1.25
ALIGNMENT_WEIGHT = 1.0
COHESION_WEIGHT = 1.0
OBSTACLE_DETECTION_RADIUS = 70
OBSTACLE_AVOIDANCE_WEIGHT = 2.6
OBSTACLE_AVOIDANCE_FORCE = 0.12

# PyGame初始化
pygame.init()
WINDOW = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption('Boids群体行为模拟')
clock = pygame.time.Clock()

# =============================
# 向量工具类（简化）
# =============================
class Vec2:
    def __init__(self, x=0, y=0):
        self.x = float(x)
        self.y = float(y)
    def __add__(self, other):
        return Vec2(self.x+other.x, self.y+other.y)
    def __sub__(self, other):
        return Vec2(self.x-other.x, self.y-other.y)
    def __mul__(self, k):
        return Vec2(self.x*k, self.y*k)
    def __truediv__(self, k):
        return Vec2(self.x/k, self.y/k)
    def length(self):
        return math.hypot(self.x, self.y)
    def normalize(self):
        l = self.length()
        return self if l==0 else self/l
    def limit(self, max_length):
        l = self.length()
        if l > max_length and l > 0:
            return self.normalize()*max_length
        return self
    def tuple(self):
        return (int(self.x), int(self.y))
    def copy(self):
        return Vec2(self.x, self.y)
    def distance(self, other):
        # 环绕地图距离
        dx = abs(self.x - other.x)
        dy = abs(self.y - other.y)
        if dx > WIDTH/2:
            dx = WIDTH - dx
        if dy > HEIGHT/2:
            dy = HEIGHT - dy
        return math.hypot(dx, dy)

# =============================
# Boid类
# =============================
class Boid:
    def __init__(self, x, y, vx, vy):
        self.pos = Vec2(x, y)
        self.vel = Vec2(vx, vy).limit(MAX_SPEED)
        self.acc = Vec2(0, 0)
    def move(self):
        # 速度更新（+=加速度），受限于最大速度
        self.vel += self.acc
        self.vel = self.vel.limit(MAX_SPEED)
        self.pos += self.vel
        self.acc = Vec2(0, 0)  # 清空加速度
        # 环绕地图边界处理
        if self.pos.x < 0:
            self.pos.x += WIDTH
        elif self.pos.x > WIDTH:
            self.pos.x -= WIDTH
        if self.pos.y < 0:
            self.pos.y += HEIGHT
        elif self.pos.y > HEIGHT:
            self.pos.y -= HEIGHT
    def update(self, boids, obstacles):
        # 三大行为力合成
        separation = self.separation(boids) * SEPARATION_WEIGHT
        alignment = self.alignment(boids) * ALIGNMENT_WEIGHT
        cohesion = self.cohesion(boids) * COHESION_WEIGHT
        avoid = self.avoid_obstacles(obstacles) * OBSTACLE_AVOIDANCE_WEIGHT
        # 最终合力
        self.acc += separation
        self.acc += alignment
        self.acc += cohesion
        self.acc += avoid
        # 位置移动
        self.move()
    def separation(self, boids):
        steer = Vec2(0, 0)
        count = 0
        for other in boids:
            if other is not self:
                d = self.pos.distance(other.pos)
                if d < SEPARATION_RADIUS and d > 0:
                    diff = self.relative_wrap(self.pos, other.pos)
                    steer += diff.normalize() / max(d, 0.1)
                    count += 1
        if count > 0:
            steer /= count
            steer = steer.limit(MAX_FORCE)
        return steer
    def alignment(self, boids):
        avg_vel = Vec2(0, 0)
        count = 0
        for other in boids:
            if other is not self:
                d = self.pos.distance(other.pos)
                if d < ALIGNMENT_RADIUS:
                    avg_vel += other.vel
                    count += 1
        if count > 0:
            avg_vel /= count
            steer = (avg_vel - self.vel).limit(MAX_FORCE)
            return steer
        return Vec2(0, 0)
    def cohesion(self, boids):
        center = Vec2(0, 0)
        count = 0
        for other in boids:
            if other is not self:
                d = self.pos.distance(other.pos)
                if d < COHESION_RADIUS:
                    center += other.pos
                    count += 1
        if count > 0:
            center /= count
            target = self.relative_wrap(center, self.pos)
            steer = target.limit(MAX_FORCE)
            return steer
        return Vec2(0,0)
    def avoid_obstacles(self, obstacles):
        # 检查前方半圆内的障碍物并施加避障力
        steer = Vec2(0, 0)
        for obs in obstacles:
            obs_vec = self.relative_wrap(obs.pos, self.pos)
            d = obs_vec.length()
            if d < OBSTACLE_DETECTION_RADIUS + obs.radius:
                angle_vel = math.atan2(self.vel.y, self.vel.x)
                angle_obs = math.atan2(obs_vec.y, obs_vec.x)
                angle_diff = math.fabs((angle_obs - angle_vel + math.pi) % (2*math.pi) - math.pi)
                # 判断是否在前方半圆内
                if angle_diff < math.pi/1.2:
                    # 施加一个垂直于速度且远离障碍的力
                    away = obs_vec * -1
                    perp = Vec2(-away.y, away.x)
                    steer_dir = away.normalize() + perp.normalize() * 0.8
                    factor = 1.0 - min(1.0, d/(OBSTACLE_DETECTION_RADIUS+obs.radius))
                    steer += steer_dir.limit(OBSTACLE_AVOIDANCE_FORCE) * factor
        return steer
    def draw(self, surface):
        # 绘制为三角形形状
        angle = math.atan2(self.vel.y, self.vel.x)
        forward = Vec2(math.cos(angle), math.sin(angle))
        left = Vec2(math.cos(angle + 2.5), math.sin(angle + 2.5))
        right = Vec2(math.cos(angle - 2.5), math.sin(angle - 2.5))
        p1 = self.pos + forward * (BOID_RADIUS*2)
        p2 = self.pos + left * BOID_RADIUS
        p3 = self.pos + right * BOID_RADIUS
        pts = [p1.tuple(), p2.tuple(), p3.tuple()]
        pygame.draw.polygon(surface, BOID_COLOR, pts)
    @staticmethod
    def relative_wrap(a, b):
        # 计算a-b的环绕矢量
        dx = a.x - b.x
        dy = a.y - b.y
        if dx > WIDTH/2: dx -= WIDTH
        if dx < -WIDTH/2: dx += WIDTH
        if dy > HEIGHT/2: dy -= HEIGHT
        if dy < -HEIGHT/2: dy += HEIGHT
        return Vec2(dx, dy)

# =============================
# 障碍物类
# =============================
class Obstacle:
    def __init__(self, x, y, radius):
        self.pos = Vec2(x, y)
        self.radius = radius
    def draw(self, surface):
        pygame.draw.circle(surface, OBSTACLE_COLOR, (int(self.pos.x), int(self.pos.y)), self.radius)

# =============================
# Boid群体初始化
# =============================
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

# =============================
# 生成障碍物
# =============================
obstacles = []
for _ in range(NUM_OBSTACLES):
    while True:
        ox = random.uniform(OBSTACLE_RADIUS+50, WIDTH-OBSTACLE_RADIUS-50)
        oy = random.uniform(OBSTACLE_RADIUS+50, HEIGHT-OBSTACLE_RADIUS-50)
        # 确保障碍物不会离地图边界太近,也不与其它障碍物堆叠
        safe = True
        for o in obstacles:
            if Vec2(ox,oy).distance(o.pos) < (OBSTACLE_RADIUS*2+40):
                safe = False
                break
        if safe:
            obstacles.append(Obstacle(ox, oy, OBSTACLE_RADIUS))
            break

# =============================
# 主游戏循环
# =============================
running = True
paused = False  # 交互：暂停标志
while running:
    clock.tick(FPS)  # 帧率控制
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        # 交互：按空格键暂停/继续、按R重置
        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_SPACE:
                paused = not paused
            elif event.key == pygame.K_r:
                # 重置Boid位置和速度
                boids = []
                for _ in range(NUM_BOIDS):
                    x = random.uniform(0, WIDTH)
                    y = random.uniform(0, HEIGHT)
                    angle = random.uniform(0, 2 * math.pi)
                    speed = random.uniform(2, 4)
                    vx = math.cos(angle) * speed
                    vy = math.sin(angle) * speed
                    boids.append(Boid(x, y, vx, vy))
    WINDOW.fill(BG_COLOR)
    # 绘制所有障碍物
    for obs in obstacles:
        obs.draw(WINDOW)
    # 更新与绘制所有Boids
    if not paused:
        for boid in boids:
            boid.update(boids, obstacles)
    for boid in boids:
        boid.draw(WINDOW)
    # 显示暂停/重置提示
    font = pygame.font.SysFont(None, 24)
    txt1 = font.render('空格:暂停/继续，R:重置Boid位置', True, (200,220,220))
    WINDOW.blit(txt1, (10,10))
    if paused:
        tipf = pygame.font.SysFont(None, 48)
        tip = tipf.render('暂停', True, (255,255,200))
        WINDOW.blit(tip, (WIDTH//2-40, HEIGHT//2-24))
    pygame.display.flip()
pygame.quit()
