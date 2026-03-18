import numpy as np
from PIL import Image

def normalize(v):
    norm = np.linalg.norm(v)
    if norm == 0:
        return v
    return v / norm

# 1. 定义球体与摄像机参数
class Sphere:
    def __init__(self, center, radius, color):
        self.center = np.array(center, dtype=float)
        self.radius = radius
        self.color = np.array(color, dtype=float)

    def intersect(self, origin, direction):
        # 返回最近相交的t和法线（如无相交返回None）
        L = self.center - origin
        t_ca = np.dot(L, direction)
        d2 = np.dot(L, L) - t_ca * t_ca
        r2 = self.radius * self.radius
        if d2 > r2:
            return None
        thc = np.sqrt(r2 - d2)
        t0 = t_ca - thc
        t1 = t_ca + thc
        if t1 < 0:
            return None
        t = t0 if t0 > 0 else t1
        hit_point = origin + t * direction
        normal = normalize(hit_point - self.center)
        return t, hit_point, normal

class Camera:
    def __init__(self, eye, target, up, fov, aspect):
        self.eye = np.array(eye, dtype=float)
        self.target = np.array(target, dtype=float)
        self.up = np.array(up, dtype=float)
        self.fov = fov
        self.aspect = aspect
        self._setup()

    def _setup(self):
        self.forward = normalize(self.target - self.eye)
        self.right = normalize(np.cross(self.forward, self.up))
        self.up = normalize(np.cross(self.right, self.forward))
        self.h = np.tan(self.fov / 2)
        self.w = self.h * self.aspect

# 2. 设定图像分辨率与投影视平面
WIDTH = 400
HEIGHT = 400
FOV = np.radians(60)

sphere = Sphere(center=[0, 0, -3], radius=1.0, color=[1, 0, 0])
camera = Camera(eye=[0, 0, 0], target=[0, 0, -1], up=[0, 1, 0], fov=FOV, aspect=WIDTH/HEIGHT)

background_color = np.array([0.2, 0.7, 1.0])  # 天空蓝
light_dir = normalize(np.array([1, -1, -1]))  # 5. 法线映射简单光源

image = np.zeros((HEIGHT, WIDTH, 3), dtype=np.float32)

# 3. 生成每个像素对应的视线
for j in range(HEIGHT):
    for i in range(WIDTH):
        # 归一化像素坐标到[-1, 1]
        x = (2 * (i + 0.5) / WIDTH - 1) * camera.w
        y = (1 - 2 * (j + 0.5) / HEIGHT) * camera.h
        direction = normalize(x * camera.right + y * camera.up + camera.forward)
        # 4. 检测光线与球体的相交点
        hit = sphere.intersect(camera.eye, direction)
        if hit is not None:
            t, point, normal = hit
            # 5. 为像素赋予基础着色效果
            diffuse = max(np.dot(normal, -light_dir), 0)
            color = sphere.color * diffuse
            image[j, i] = np.clip(color, 0, 1)
        else:
            image[j, i] = background_color

# 6. 将像素颜色写入到图像缓冲区 (已在上面填充image数组)
# 7. 保存或显示最终渲染图片
image_out = (image * 255).astype(np.uint8)
img = Image.fromarray(image_out, 'RGB')
img.save('raytraced_sphere.png')
print('渲染完成，图片已保存为 raytraced_sphere.png')
