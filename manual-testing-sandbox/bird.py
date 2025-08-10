import pygame  # 导入PyGame库
import random  # 导入random库，便于后续使用
import math    # 导入math库，便于后续计算

# 初始化PyGame模块
pygame.init()

# 设置窗口尺寸与标题
WINDOW_WIDTH = 800     
WINDOW_HEIGHT = 600    

# 创建窗口
screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))  
# 设置窗口标题
pygame.display.set_caption('群鸟算法演示 Bird Flocking Demo')  

# ========== s-5: 定义鸟类的数据结构与属性 ==========
class Bird:
    """
    鸟类对象。其中每只鸟有自己的位置和速度，用于群体行为模拟。
    """
    def __init__(self, x, y, vx, vy):
        self.x = x          # 鸟的水平方向位置
        self.y = y          # 鸟的竖直方向位置
        self.vx = vx        # 鸟的水平方向速度
        self.vy = vy        # 鸟的竖直方向速度
        # 美化: 鸟拥有各自的颜色、尺寸
        self.size = random.randint(7, 11)
        self.base_color = random.choice([
            (245, 215, 80),   # 温和黄
            (130, 198, 255),  # 清新蓝
            (240, 120, 90),   # 活力橙
            (90, 210, 130),   # 绿色调
            (225, 130, 220)   # 紫粉色
        ])
        # 状态高亮（如鼠标附近）后续可用
    
    def get_pos(self):
        """获取当前位置"""
        return (self.x, self.y)
    
    def get_velocity(self):
        """获取当前速度"""
        return (self.vx, self.vy)

# ========== s-6: 实现鸟的初始化及生成函数 ==========
# 参数设定：鸟群数量
NUM_BIRDS = 90

# 鸟的最大速度，用于限制运动速度
MAX_SPEED = 1.0

# 鸟的最小速度，避免静止和重叠bug
MIN_SPEED = 0.18  # s-15: 异常修复，速度不能过慢

# 生成鸟群的初始化方法

def generate_birds(num_birds):
    """
    生成指定数量的Bird对象，随机分布于屏幕，各自有随机速度。
    """
    birds = []
    for _ in range(num_birds):
        x = random.uniform(50, WINDOW_WIDTH - 50)
        y = random.uniform(50, WINDOW_HEIGHT - 50)
        angle = random.uniform(0, 2 * math.pi)
        speed = random.uniform(MAX_SPEED * 0.5, MAX_SPEED)
        vx = math.cos(angle) * speed
        vy = math.sin(angle) * speed
        birds.append(Bird(x, y, vx, vy))
    return birds

# 实例化鸟群
birds = generate_birds(NUM_BIRDS)

# ========== s-7: 实现鸟的单独移动与边界处理 ==========

def move_bird(bird):
    """
    鸟的基础移动逻辑，并处理边界：鸟将环绕屏幕。
    """
    bird.x += bird.vx
    bird.y += bird.vy

    # 边界处理（环绕方式）
    if bird.x < 0:
        bird.x += WINDOW_WIDTH
    elif bird.x >= WINDOW_WIDTH:
        bird.x -= WINDOW_WIDTH
    if bird.y < 0:
        bird.y += WINDOW_HEIGHT
    elif bird.y >= WINDOW_HEIGHT:
        bird.y -= WINDOW_HEIGHT

# ========== s-8: 实现鸟之间的靠拢规则 ==========

def rule_cohesion(bird, birds):
    """
    群体靠拢：让鸟向邻居中心靠近。
    """
    NEIGHBOR_DIST = 60  # 靠拢影响距离
    center_x = 0.0
    center_y = 0.0
    count = 0
    for other in birds:
        if other is not bird:
            dist = math.hypot(bird.x - other.x, bird.y - other.y)
            if dist < NEIGHBOR_DIST:
                center_x += other.x
                center_y += other.y
                count += 1
    if count > 0:
        # 计算群体中心并返回指向中心的微小速度修正
        center_x /= count
        center_y /= count
        dx = (center_x - bird.x) * 0.005  # 调节系数
        dy = (center_y - bird.y) * 0.005
        return dx, dy
    return 0.0, 0.0

# ========== s-9: 实现鸟之间的分离规则 ==========

def rule_separation(bird, birds):
    """
    防撞分离：让鸟远离过于靠近的其他鸟。
    """
    AVOID_DIST = 25  # 分离距离
    move_x = 0.0
    move_y = 0.0
    for other in birds:
        if other is not bird:
            dx = bird.x - other.x
            dy = bird.y - other.y
            dist = math.hypot(dx, dy)
            if dist < AVOID_DIST and dist > 0:
                move_x += dx / dist   # 单位向量反推
                move_y += dy / dist
    move_x *= 0.05  # 调节系数
    move_y *= 0.05
    return move_x, move_y

# ========== s-10: 实现鸟之间的趋同规则 ==========

def rule_alignment(bird, birds):
    """
    方向趋同：让鸟群速度逐渐一致。
    """
    ALIGN_DIST = 60  # 趋同影响距离
    avg_vx = 0.0
    avg_vy = 0.0
    count = 0
    for other in birds:
        if other is not bird:
            dist = math.hypot(bird.x - other.x, bird.y - other.y)
            if dist < ALIGN_DIST:
                avg_vx += other.vx
                avg_vy += other.vy
                count += 1
    if count > 0:
        avg_vx /= count
        avg_vy /= count
        # 调节当前速度略微靠近邻居平均速度
        dvx = (avg_vx - bird.vx) * 0.05
        dvy = (avg_vy - bird.vy) * 0.05
        return dvx, dvy
    return 0.0, 0.0

# ========== s-11: 组合并应用所有鸟群规则 ==========

def update_bird(bird, birds):
    """
    鸟的全局行为：结合靠拢、分离、趋同规则。
    """
    dx1, dy1 = rule_cohesion(bird, birds)
    dx2, dy2 = rule_separation(bird, birds)
    dx3, dy3 = rule_alignment(bird, birds)
    # 权重混合
    bird.vx += dx1 + dx2 + dx3
    bird.vy += dy1 + dy2 + dy3

    # s-15: 限制速度范围，避免速度异常与鸟重叠
    speed = math.hypot(bird.vx, bird.vy)
    if speed > MAX_SPEED:
        scale = MAX_SPEED / speed
        bird.vx *= scale
        bird.vy *= scale
    elif speed < MIN_SPEED:
        # 保证速度>MIN_SPEED，防止鸟停下导致重叠
        if speed == 0.0:
            # 随机重新来一个小速度，防止死鸟
            angle = random.uniform(0, 2*math.pi)
            bird.vx = math.cos(angle) * MIN_SPEED
            bird.vy = math.sin(angle) * MIN_SPEED
        else:
            scale = MIN_SPEED / speed
            bird.vx *= scale
            bird.vy *= scale

# ========== s-4: 定义游戏主循环结构 ========== 
running = True  # 主循环标志
clock = pygame.time.Clock() # s-14: 控制帧率使动画流畅

while running:
    # 事件检测部分：用于响应退出等基础事件
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False  # 用户点击关闭按钮则退出主循环

    # 鼠标互动（s-16），鼠标影响鸟群聚集
    mouse_pos = pygame.mouse.get_pos()
    mouse_pressed = pygame.mouse.get_pressed()[0]
    
    # 鸟群行为并移动
    for bird in birds:
        if mouse_pressed:
            # 鼠标左键按下时，附近鸟主动靠近指针，仿造'喂食'聚集效果
            mx, my = mouse_pos
            dist = math.hypot(bird.x - mx, bird.y - my)
            if dist < 100:
                dx = (mx - bird.x) * 0.008
                dy = (my - bird.y) * 0.008
                bird.vx += dx
                bird.vy += dy
        update_bird(bird, birds)
        move_bird(bird)

    # 清空屏幕并刷新背景 ========== s-12 ==========
    # s-16: 背景美化，渐变星空效果
    sky_color_top = (30, 30, 48)
    sky_color_bottom = (70, 100, 180)
    for y in range(0, WINDOW_HEIGHT, 4):
        blend = y / WINDOW_HEIGHT
        r = int(sky_color_top[0] * (1-blend) + sky_color_bottom[0] * blend)
        g = int(sky_color_top[1] * (1-blend) + sky_color_bottom[1] * blend)
        b = int(sky_color_top[2] * (1-blend) + sky_color_bottom[2] * blend)
        pygame.draw.rect(screen, (r,g,b), (0,y,WINDOW_WIDTH,4))
    # 随机星点（仅美化无性能影响）
    for _ in range(6):
        x = random.randint(0,WINDOW_WIDTH)
        y = random.randint(0,WINDOW_HEIGHT//2)
        pygame.draw.circle(screen, (255,255,220), (x,y), 1)

    # ========== s-13: 绘制所有鸟的图像 ==========
    for bird in birds:
        # 鸟的朝向角度计算：用于小三角形绘制
        angle = math.atan2(bird.vy, bird.vx)
        size = bird.size # s-16: 每只鸟不同大小
        col = bird.base_color

        # s-16: 鼠标高亮鸟群
        mx, my = mouse_pos
        dist_mouse = math.hypot(bird.x-mx, bird.y-my)
        if dist_mouse < 24:
            col = (255,255,255)
        # 羽毛色彩渐变（根据方向速度微调更生动）
        highlight = min(35,int(abs(bird.vx+bird.vy)*110))
        draw_color = (
            min(255,col[0]+highlight),
            min(255,col[1]+highlight//2),
            min(255,col[2]+highlight//2)
        )
        # 计算三角形三个顶点（前端、左翼、右翼）
        tip = (bird.x + math.cos(angle) * size, bird.y + math.sin(angle) * size)
        left = (bird.x + math.cos(angle + 2.5) * size * 0.7, bird.y + math.sin(angle + 2.5) * size * 0.7)
        right = (bird.x + math.cos(angle - 2.5) * size * 0.7, bird.y + math.sin(angle - 2.5) * size * 0.7)
        points = [tip, left, right]
        pygame.draw.polygon(screen, draw_color, points)
        # s-16: 鸟身虚影，增加立体感
        mid_x = (tip[0] + bird.x) / 2
        mid_y = (tip[1] + bird.y) / 2
        pygame.draw.circle(screen, (draw_color[0]//2, draw_color[1]//2, draw_color[2]//2), (int(mid_x), int(mid_y)), max(2, size//3))

    # s-14: 更新屏幕显示使动画流畅
    pygame.display.flip()  # 按帧刷新全部内容显示到窗口
    clock.tick(60)  # 控制帧率最高为60帧，保证不卡顿、动画平滑

# 游戏主循环结束，安全退出PyGame
pygame.quit()
