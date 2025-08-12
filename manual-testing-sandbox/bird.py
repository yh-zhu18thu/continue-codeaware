import arcade
import math
import random

# 屏幕参数
SCREEN_WIDTH = 800
SCREEN_HEIGHT = 600
SCREEN_TITLE = "Boids 群体行为仿真"

# Boid参数
BOID_COUNT = 30
BOID_RADIUS = 8
BOID_MAX_SPEED = 3.5
BOID_MAX_FORCE = 0.10

# 规则半径
SEPARATION_RADIUS = 28
ALIGNMENT_RADIUS = 65
COHESION_RADIUS = 65

# 规则权重（可调节实现不同风格）
SEPARATION_WEIGHT = 1.5
ALIGNMENT_WEIGHT = 1.0
COHESION_WEIGHT = 1.0
AVOID_WEIGHT = 2.4

# 障碍物参数
OBSTACLE_COUNT = 3
OBSTACLE_MIN_RADIUS = 30
OBSTACLE_MAX_RADIUS = 60

# 避障参数
OBSTACLE_AVOID_RADIUS = 70  # 只在这个半径内才考察避障
OBSTACLE_VIEW_ANGLE = math.pi  # 半圆，视野夹角180°

class Vector2:
    """
    简易2D向量类，兼容Arcade大多数操作。
    """
    def __init__(self, x, y):
        self.x = x
        self.y = y
    def __add__(self, other):
        return Vector2(self.x+other.x, self.y+other.y)
    def __sub__(self, other):
        return Vector2(self.x-other.x, self.y-other.y)
    def __mul__(self, scalar):
        return Vector2(self.x*scalar, self.y*scalar)
    def __truediv__(self, scalar):
        return Vector2(self.x/scalar, self.y/scalar)
    def __neg__(self):
        return Vector2(-self.x, -self.y)
    @property
    def length(self):
        return math.hypot(self.x, self.y)
    def normalize(self):
        l = self.length
        if l == 0:
            return Vector2(0, 0)
        return self / l
    def limit(self, max_val):
        l = self.length
        if l > max_val:
            return self.normalize() * max_val
        return self
    def copy(self):
        return Vector2(self.x, self.y)
    def dot(self, other):
        return self.x * other.x + self.y * other.y
    def angle_with(self, other):
        dot = self.dot(other)
        l1 = self.length
        l2 = other.length
        if l1 == 0 or l2 == 0:
            return 0.0
        cos_theta = max(min(dot / (l1*l2), 1), -1)
        return math.acos(cos_theta)
    def perpendicular(self):
        return Vector2(-self.y, self.x)

class Obstacle:
    def __init__(self, position, radius):
        self.position = position  # Vector2
        self.radius = radius

class Boid:
    def __init__(self, position, velocity, radius=BOID_RADIUS):
        self.position = position      # Vector2
        self.velocity = velocity      # Vector2
        self.acceleration = Vector2(0, 0)
        self.radius = radius

    def apply_force(self, force):
        self.acceleration += force

    def update(self):
        # 更新速度、限制最大速度
        self.velocity += self.acceleration
        self.velocity = self.velocity.limit(BOID_MAX_SPEED)
        self.position += self.velocity
        self.acceleration = Vector2(0, 0)  # 步进后清空加速度
        # 环绕边界（拓扑环绕）
        if self.position.x < 0:
            self.position.x += SCREEN_WIDTH
        elif self.position.x > SCREEN_WIDTH:
            self.position.x -= SCREEN_WIDTH
        if self.position.y < 0:
            self.position.y += SCREEN_HEIGHT
        elif self.position.y > SCREEN_HEIGHT:
            self.position.y -= SCREEN_HEIGHT

    # ===================== Boid行为规则 =====================

    def separation(self, neighbors):
        # 分离规则：远离太近的伙伴
        steer = Vector2(0, 0)
        count = 0
        for other in neighbors:
            diff = self.get_delta(other)
            dist = diff.length
            if dist > 0:
                steer += diff.normalize() / dist  # 越近推得越猛
                count += 1
        if count > 0:
            steer = steer / count
            if steer.length > 0:
                steer = steer.normalize() * BOID_MAX_SPEED - self.velocity
                steer = steer.limit(BOID_MAX_FORCE) * SEPARATION_WEIGHT
        return steer

    def alignment(self, neighbors):
        # 对齐规则：靠拢邻居平均速度
        count = 0
        sum_vel = Vector2(0, 0)
        for other in neighbors:
            sum_vel += other.velocity
            count += 1
        if count > 0:
            mean_vel = sum_vel / count
            steer = mean_vel.normalize() * BOID_MAX_SPEED - self.velocity
            steer = steer.limit(BOID_MAX_FORCE) * ALIGNMENT_WEIGHT
            return steer
        else:
            return Vector2(0, 0)

    def cohesion(self, neighbors):
        # 凝聚规则：靠拢邻居中心点
        count = 0
        center = Vector2(0, 0)
        for other in neighbors:
            center += other.position
            count += 1
        if count > 0:
            center = center / count
            steer = self.steer_towards(center)
            steer = steer * COHESION_WEIGHT
            return steer
        else:
            return Vector2(0, 0)

    def steer_towards(self, target):
        # 朝目标点施加转向力
        desired = (target - self.position)
        if desired.length == 0:
            return Vector2(0, 0)
        desired = desired.normalize() * BOID_MAX_SPEED
        steer = desired - self.velocity
        steer = steer.limit(BOID_MAX_FORCE)
        return steer

    def avoid_obstacles(self, obstacles):
        # 检测前方障碍物并避让
        max_force = Vector2(0, 0)
        min_dist = float('inf')
        direction = self.velocity.normalize() if self.velocity.length > 0 else Vector2(1, 0)
        for ob in obstacles:
            # 计算最近周期距离
            rel = self.cyclic_delta(ob.position)
            dist = rel.length - ob.radius
            if dist > OBSTACLE_AVOID_RADIUS+ob.radius:
                continue  # 过远不理会
            # 检测是否在前方半圆
            if rel.length == 0:
                continue  # 忽略共点
            angle = direction.angle_with(rel)
            if angle > OBSTACLE_VIEW_ANGLE/2:
                continue # 不在前方
            # 如果最近说明紧急
            if dist < min_dist:
                min_dist = dist
                # 求斥力方向：速度方向的垂直向外分量
                perp = rel.perpendicular().normalize()
                if perp.dot(direction) < 0:
                    perp = -perp  # 保证垂直向一侧(右左随意)
                # 力大小与距离——距离越近，越强（反比或指数可选）
                strength = 0
                if dist < 0:  # 被吞没
                    strength = 2.0 * AVOID_WEIGHT
                else:
                    strength = (OBSTACLE_AVOID_RADIUS + 1 - dist) / OBSTACLE_AVOID_RADIUS * AVOID_WEIGHT
                    strength = max(strength, 0)
                steer_vec = perp * strength * BOID_MAX_FORCE
                max_force = steer_vec
        return max_force

    def get_delta(self, other):
        # 求周期环绕下self到other的最短delta向量
        dx = other.position.x - self.position.x
        dy = other.position.y - self.position.y
        # 环绕最近差分
        if dx > SCREEN_WIDTH / 2:
            dx -= SCREEN_WIDTH
        elif dx < -SCREEN_WIDTH / 2:
            dx += SCREEN_WIDTH
        if dy > SCREEN_HEIGHT / 2:
            dy -= SCREEN_HEIGHT
        elif dy < -SCREEN_HEIGHT / 2:
            dy += SCREEN_HEIGHT
        return Vector2(dx, dy)

    def cyclic_delta(self, target_pos):
        # self到target_pos的环绕最小delta向量
        dx = target_pos.x - self.position.x
        dy = target_pos.y - self.position.y
        if dx > SCREEN_WIDTH/2:
            dx -= SCREEN_WIDTH
        elif dx < -SCREEN_WIDTH/2:
            dx += SCREEN_WIDTH
        if dy > SCREEN_HEIGHT/2:
            dy -= SCREEN_HEIGHT
        elif dy < -SCREEN_HEIGHT/2:
            dy += SCREEN_HEIGHT
        return Vector2(dx, dy)

class BoidsApp(arcade.Window):
    def __init__(self, width, height, title):
        super().__init__(width, height, title, update_rate=1/60)
        self.boids = []
        self.obstacles = []
        arcade.set_background_color(arcade.color.WHITE)
    def setup(self):
        # 初始化Boids
        self.boids.clear()
        for _ in range(BOID_COUNT):
            pos = Vector2(
                random.uniform(0, SCREEN_WIDTH),
                random.uniform(0, SCREEN_HEIGHT))
            angle = random.uniform(0, 2*math.pi)
            vel = Vector2(math.cos(angle), math.sin(angle)) * random.uniform(1.5, BOID_MAX_SPEED)
            self.boids.append(Boid(pos, vel))
        # 初始化障碍物
        self.obstacles.clear()
        for _ in range(OBSTACLE_COUNT):
            pos = Vector2(
                random.uniform(100, SCREEN_WIDTH-100),
                random.uniform(100, SCREEN_HEIGHT-100))
            radius = random.uniform(OBSTACLE_MIN_RADIUS, OBSTACLE_MAX_RADIUS)
            self.obstacles.append(Obstacle(pos, radius))

    def on_draw(self):
        """
        渲染内容。
        绘制Boid和障碍物。
        """
        arcade.start_render()
        # 绘制障碍物
        for obstacle in self.obstacles:
            arcade.draw_circle_filled(
                obstacle.position.x, obstacle.position.y,
                obstacle.radius, arcade.color.GRAY)
        # 绘制boids
        for boid in self.boids:
            # 画三角形代表鸟的朝向
            direction = boid.velocity.normalize() if boid.velocity.length > 0 else Vector2(1, 0)
            perp = Vector2(-direction.y, direction.x)
            tip = boid.position + direction * (boid.radius * 2.3)
            left = boid.position + perp * boid.radius * 0.8 - direction * boid.radius * 0.8
            right = boid.position - perp * boid.radius * 0.8 - direction * boid.radius * 0.8
            # 是否正在避障
            avoid_force = boid.avoid_obstacles(self.obstacles)
            in_avoid = avoid_force.length > 0.01
            color = arcade.color.RED if in_avoid else arcade.color.BLUE
            arcade.draw_triangle_filled(tip.x, tip.y, left.x, left.y, right.x, right.y, color)
            # 可选：画朝向箭头
            # arrow_end = boid.position + direction*boid.radius*2.6
            # arcade.draw_line(boid.position.x, boid.position.y, arrow_end.x, arrow_end.y, arcade.color.DARK_GRAY, 2)
            # 可加：视觉辅助圈
            # arcade.draw_circle_outline(boid.position.x, boid.position.y, COHESION_RADIUS, arcade.color.ALIZARIN_CRIMSON, 1)

    def on_update(self, delta_time):
        """
        每帧刷新回调，负责逻辑更新。
        新增实现：
        1. 计算每只Boid的邻居列表（分离、对齐、凝聚三组邻居可分别设定不同半径）；
        2. 对每只Boid分别叠加三则群行为产生的加速度。
        3. 检查障碍物，并根据需要叠加避障力。
        """
        boids_count = len(self.boids)
        # 遍历每只Boid
        for i in range(boids_count):
            boid = self.boids[i]
            separation_neighbors = []
            alignment_neighbors = []
            cohesion_neighbors = []
            for j in range(boids_count):
                if i == j:
                    continue
                other = self.boids[j]
                # 环绕距离
                dx = abs(boid.position.x - other.position.x)
                if dx > SCREEN_WIDTH / 2:
                    dx = SCREEN_WIDTH - dx
                dy = abs(boid.position.y - other.position.y)
                if dy > SCREEN_HEIGHT / 2:
                    dy = SCREEN_HEIGHT - dy
                distance = math.hypot(dx, dy)
                if distance < SEPARATION_RADIUS:
                    separation_neighbors.append(other)
                if distance < ALIGNMENT_RADIUS:
                    alignment_neighbors.append(other)
                if distance < COHESION_RADIUS:
                    cohesion_neighbors.append(other)
            # 计算三大群体行为力
            sep_force = boid.separation(separation_neighbors)
            ali_force = boid.alignment(alignment_neighbors)
            coh_force = boid.cohesion(cohesion_neighbors)
            # 计算避障力（权重大，优先）
            avoid_force = boid.avoid_obstacles(self.obstacles)
            # 按权重叠加
            total_force = sep_force + ali_force + coh_force + avoid_force
            boid.apply_force(total_force)
        # 更新运动学
        for boid in self.boids:
            boid.update()  # 更新每只Boid的位置

    # 可选：实时调节、添加Boid/障碍物等扩展

if __name__ == "__main__":
    app = BoidsApp(SCREEN_WIDTH, SCREEN_HEIGHT, SCREEN_TITLE)
    app.setup()
    arcade.run()
