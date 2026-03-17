import numpy as np
from PIL import Image

class Camera:
    def __init__(self, position, look_at, up, fov, aspect_ratio, width, height):
        self.position = np.array(position, dtype=np.float32)
        self.fov = fov  # Field of view in degrees
        self.width = width
        self.height = height
        self.aspect_ratio = aspect_ratio

        # Camera coordinate frame
        w = np.array(position, dtype=np.float32) - np.array(look_at, dtype=np.float32)
        w = w / np.linalg.norm(w)
        u = np.cross(up, w)
        u = u / np.linalg.norm(u)
        v = np.cross(w, u)

        self.u = u
        self.v = v
        self.w = w

        self.screen_height = 2 * np.tan(np.radians(fov/2))
        self.screen_width = self.screen_height * aspect_ratio

    def generate_ray(self, x, y):
        px = ((x + 0.5) / self.width - 0.5) * self.screen_width
        py = (0.5 - (y + 0.5) / self.height) * self.screen_height
        direction = -self.w + px * self.u + py * self.v
        direction = direction / np.linalg.norm(direction)
        return self.position.copy(), direction

class Sphere:
    def __init__(self, center, radius, color):
        self.center = np.array(center, dtype=np.float32)
        self.radius = radius
        self.color = np.array(color, dtype=np.uint8)

    def intersect(self, ray_origin, ray_direction):
        oc = ray_origin - self.center
        a = np.dot(ray_direction, ray_direction)
        b = 2.0 * np.dot(oc, ray_direction)
        c = np.dot(oc, oc) - self.radius**2
        discriminant = b**2 - 4*a*c
        if discriminant < 0:
            return False, None
        sqrt_disc = np.sqrt(discriminant)
        t0 = (-b - sqrt_disc) / (2*a)
        t1 = (-b + sqrt_disc) / (2*a)
        t = min(t0, t1)
        if t < 0:
            t = max(t0, t1)
        if t < 0:
            return False, None
        return True, t

def render(camera, objects, background_color):
    img = np.zeros((camera.height, camera.width, 3), dtype=np.uint8)
    for y in range(camera.height):
        for x in range(camera.width):
            ray_origin, ray_direction = camera.generate_ray(x, y)
            hit_any = False
            min_t = np.inf
            pixel_color = background_color
            for obj in objects:
                hit, t = obj.intersect(ray_origin, ray_direction)
                if hit and t < min_t:
                    min_t = t
                    pixel_color = obj.color
                    hit_any = True
            img[y, x] = pixel_color
    return img

def main():
    # Step 1: Define camera parameters
    width = 400
    height = 300
    aspect_ratio = width / height
    fov = 60
    camera_pos = [0, 0, 1.5]  # Camera position in world coordinates
    look_at = [0, 0, 0]       # Camera looking at the origin
    up = [0, 1, 0]            # Up is in positive Y direction
    camera = Camera(camera_pos, look_at, up, fov, aspect_ratio, width, height)

    # Step 3: Define sphere
    sphere_center = [0, 0, 0]
    sphere_radius = 0.5
    sphere_color = [255, 0, 0]  # Red
    sphere = Sphere(sphere_center, sphere_radius, sphere_color)

    # Step 5: Background color
    background_color = np.array([80, 160, 240], dtype=np.uint8)  # Light blue

    img = render(camera, [sphere], background_color)

    # Step 6: Output image
    image = Image.fromarray(img, 'RGB')
    image.save('rendered_sphere.png')
    image.show()

if __name__ == "__main__":
    main()
