# Boids群鸟模拟 - PyGame动态可视化实现
# 功能：分离、对齐、凝聚规则+环绕地图+障碍物感知避障+可交互暂停/重置

import pygame
import random
import math
import sys

# --------- 参数设定 ---------
WIDTH = 800            # 地图宽度
HEIGHT = 600           # 地图高度
BOID_NUM = 30          # 鸟群数量
BOID_SIZE = 8          # Boid显示大小（像素）
VIEW_RADIUS = 60       # 感知半径
MAX_SPEED = 4.0        # Boid最大速度
MAX_FORCE = 0.05       # Boid最大转向力
SEPARATION_WEIGHT = 1.5
ALIGNMENT_WEIGHT = 1.0
COHESION_WEIGHT = 1.1
AVOID_WEIGHT = 2.2     # 避障力权重
OBSTACLE_RADIUS = 32   # 障碍物半径
OBSTACLE_NUM = 5       # 障碍物数量
OBSTACLE_SAFE_DIST = VIEW_RADIUS + OBSTACLE_RADIUS + 10 #边界安全范围

FPS = 60               # 帧率
WHITE = (255,255,255)
BLACK = (  0,  0,  0)
BOID_COLOR = (90,180,255)
OBSTACLE_COLOR = (220,60,60)

# --------- 向量工具函数 ---------
def vec_add(a, b):
    return [a[0]+b[0], a[1]+b[1]]
def vec_sub(a, b):
    return [a[0]-b[0], a[1]-b[1]]
def vec_mult(a, s):
    return [a[0]*s, a[1]*s]
def vec_div(a, s):
    return [a[0]/s, a[1]/s]
def vec_mag(a):
    return math.hypot(a[0], a[1])
def vec_limit(a, maxv):
    m = vec_mag(a)
    if m>maxv:
        return vec_mult(vec_normalize(a), maxv)
    return a
def vec_normalize(a):
    m = vec_mag(a)
    if m==0:
        return [0,0]
    return [a[0]/m, a[1]/m]
def vec_angle(a):
    return math.atan2(a[1], a[0])

def rotate_vec(v, angle):
    c = math.cos(angle)
    s = math.sin(angle)
    return [v[0]*c - v[1]*s, v[0]*s + v[1]*c]
# ------------------------------

# --------- 障碍物类 ---------
class Obstacle:
    def __init__(self, pos, radius):
        self.pos = pos
        self.radius = radius
    def draw(self, screen):
        pygame.draw.circle(screen, OBSTACLE_COLOR, (int(self.pos[0]),int(self.pos[1])), self.radius)

# --------- Boid类定义 ---------
class Boid:
    def __init__(self, pos, vel):
        self.pos = pos
        self.vel = vel
        self.acc = [0,0]

    def update(self):
        # 速度和位置更新
        self.vel = vec_add(self.vel, self.acc)
        self.vel = vec_limit(self.vel, MAX_SPEED)
        self.pos = vec_add(self.pos, self.vel)
        self.acc = [0, 0]

    def apply_force(self, force):
        # 施加行为力
        self.acc = vec_add(self.acc, force)

    def edges(self):
        # 环绕式边界处理
        x, y = self.pos
        if x > WIDTH:
            self.pos[0] = 0
        elif x < 0:
            self.pos[0] = WIDTH
        if y > HEIGHT:
            self.pos[1] = 0
        elif y < 0:
            self.pos[1] = HEIGHT

    def draw(self, screen):
        # 用三角形箭头表示Boid朝向
        angle = vec_angle(self.vel)
        # 基础三角形顶点相对坐标
        pts = [
            [BOID_SIZE, 0], 
            [-BOID_SIZE*0.7, BOID_SIZE*0.5],
            [-BOID_SIZE*0.7, -BOID_SIZE*0.5]]
        rotated = [vec_add(self.pos, rotate_vec(p, angle)) for p in pts]
        pygame.draw.polygon(screen, BOID_COLOR, rotated)

    def separation(self, boids):
        steer = [0,0]
        total = 0
        for b in boids:
            d = boid_distance(self.pos, b.pos)
            if b is not self and d < VIEW_RADIUS and d > 0:
                diff = vec_sub(self.pos, b.pos)
                diff = vec_div(diff, d)  # 距离越近越推得强烈
                steer = vec_add(steer, diff)
                total +=1
        if total>0:
            steer = vec_div(steer, total)
            steer = vec_normalize(steer)
            steer = vec_mult(steer, MAX_SPEED)
            steer = vec_sub(steer, self.vel)
            steer = vec_limit(steer, MAX_FORCE)
        return steer

    def alignment(self, boids):
        avg = [0,0]
        total = 0
        for b in boids:
            d = boid_distance(self.pos, b.pos)
            if b is not self and d < VIEW_RADIUS and d > 0:
                avg = vec_add(avg, b.vel)
                total +=1
        if total>0:
            avg = vec_div(avg, total)
            avg = vec_normalize(avg)
            avg = vec_mult(avg, MAX_SPEED)
            steer = vec_sub(avg, self.vel)
            steer = vec_limit(steer, MAX_FORCE)
            return steer
        return [0,0]

    def cohesion(self, boids):
        center = [0,0]
        total = 0
        for b in boids:
            d = boid_distance(self.pos, b.pos)
            if b is not self and d < VIEW_RADIUS and d > 0:
                center = vec_add(center, b.pos)
                total +=1
        if total>0:
            center = vec_div(center, total)
            desired = vec_sub(center, self.pos)
            desired = vec_normalize(desired)
            desired = vec_mult(desired, MAX_SPEED)
            steer = vec_sub(desired, self.vel)
            steer = vec_limit(steer, MAX_FORCE)
            return steer
        return [0,0]

    def avoid_obstacles(self, obstacles):
        """
        检测自身速度方向（前方半圆）内障碍，施加避障力
        力大小与距离成反比，方向为速度垂直方向、远离障碍物一侧
        """
        avoid_force = [0,0]
        for ob in obstacles:
            d = boid_distance(self.pos, ob.pos)
            if d< VIEW_RADIUS + ob.radius*2:
                # 计算相对方向夹角
                to_ob = vec_sub(ob.pos, self.pos)
                angle_vel = vec_angle(self.vel)
                angle_ob = vec_angle(to_ob)
                angle_diff = math.atan2(math.sin(angle_ob-angle_vel), math.cos(angle_ob-angle_vel))
                # 前方半圆判断：夹角[-pi/2, pi/2]
                if abs(angle_diff)<math.pi/2:
                    # 距离越近力度越大
                    prox = max(1, d - ob.radius)
                    # 当前速度垂直方向: 确保远离障碍一侧
                    side = 1 if angle_diff>0 else -1
                    perp = rotate_vec(vec_normalize(self.vel), side*math.pi/2)
                    strength = AVOID_WEIGHT * (VIEW_RADIUS + ob.radius - d) / (VIEW_RADIUS + ob.radius)
                    force = vec_mult(perp, strength)
                    avoid_force = vec_add(avoid_force, force)
        # 限制避障力最大值
        avoid_force = vec_limit(avoid_force, MAX_FORCE*3)
        return avoid_force

# ---------- 距离函数（支持环绕地图） ----------
def boid_distance(p1, p2):
    dx = abs(p1[0] - p2[0])
    dy = abs(p1[1] - p2[1])
    if dx > WIDTH/2:
        dx = WIDTH - dx
    if dy > HEIGHT/2:
        dy = HEIGHT - dy
    return math.hypot(dx, dy)

def boid_pos_wrap(p):
    x = p[0]%WIDTH
    y = p[1]%HEIGHT
    return [x,y]

# ---------- 障碍物生成 ----------
def generate_obstacles():
    obstacles = []
    tries = 0
    while len(obstacles)<OBSTACLE_NUM and tries<9999:
        x = random.randint(OBSTACLE_SAFE_DIST, WIDTH-OBSTACLE_SAFE_DIST)
        y = random.randint(OBSTACLE_SAFE_DIST, HEIGHT-OBSTACLE_SAFE_DIST)
        pos = [x,y]
        # 确保障碍物不重叠
        ok = True
        for ob in obstacles:
            if boid_distance(pos, ob.pos)<OBSTACLE_RADIUS*2+10:
                ok = False
                break
        if ok:
            obstacles.append(Obstacle(pos, OBSTACLE_RADIUS))
        tries+=1
    return obstacles

# ---------- Boid群体初始化 ----------
def init_boids():
    boids=[]
    for i in range(BOID_NUM):
        # 避开障碍物及边界
        safe=True
        tries=0
        while tries<100:
            x = random.uniform(OBSTACLE_SAFE_DIST, WIDTH-OBSTACLE_SAFE_DIST)
            y = random.uniform(OBSTACLE_SAFE_DIST, HEIGHT-OBSTACLE_SAFE_DIST)
            vel = [random.uniform(-1,1)*MAX_SPEED, random.uniform(-1,1)*MAX_SPEED]
            pos = [x,y]
            safe=True
            for ob in obstacles:
                if boid_distance(pos, ob.pos)<OBSTACLE_RADIUS+VIEW_RADIUS:
                    safe=False
                    break
            if safe:
                boids.append(Boid(pos, vel))
                break
            tries+=1
    return boids

# --------- PyGame初始化 ---------
pygame.init()
screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Boids群鸟模拟演示-避障+环绕地图")
clock = pygame.time.Clock()

# --------- 游戏主变量 ---------
obstacles = generate_obstacles()
boids = init_boids()
paused = False

# --------- 主运行循环 ---------
while True:
    # --- 事件处理 ---
    for event in pygame.event.get():
        if event.type==pygame.QUIT:
            pygame.quit()
            sys.exit(0)
        if event.type==pygame.KEYDOWN:
            if event.key==pygame.K_SPACE:
                paused = not paused  # 空格暂停/继续
            if event.key==pygame.K_r:
                # R键重置Boid分布和速度（障碍物不变）
                boids = init_boids()
            if event.key==pygame.K_ESCAPE:
                pygame.quit()
                sys.exit(0)
    
    # --- 更新与绘制 ---
    if not paused:
        for b in boids:
            # 三大行为规则
            sep = b.separation(boids)
            ali = b.alignment(boids)
            coh = b.cohesion(boids)
            # 避障规则
            avoid = b.avoid_obstacles(obstacles)
            # 最终行为加权合成
            b.apply_force(vec_mult(sep, SEPARATION_WEIGHT))
            b.apply_force(vec_mult(ali, ALIGNMENT_WEIGHT))
            b.apply_force(vec_mult(coh, COHESION_WEIGHT))
            b.apply_force(avoid)  #避障力已内含weight
            b.update()
            b.edges()

    # --- 画面刷新 ---
    screen.fill(WHITE)
    # 绘制障碍物
    for ob in obstacles:
        ob.draw(screen)
    # 绘制Boids
    for b in boids:
        b.draw(screen)
    # 提示文字
    info = "空格:暂停/继续   R:重置群鸟   ESC:退出      Boid数量:%d" % len(boids)
    font = pygame.font.SysFont('arial', 18)
    text = font.render(info, True, (40,40,40))
    screen.blit(text,(10,10))
    if paused:
        text2 = font.render("[已暂停]", True, (200,80,80))
        screen.blit(text2,(10,35))
    pygame.display.flip()
    clock.tick(FPS)
