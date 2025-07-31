import pygame
import os

# Initialize pygame
pygame.init()
print('Pygame successfully installed and initialized!')

# Create game window
screen_width = 800
screen_height = 600
screen = pygame.display.set_mode((screen_width, screen_height))
pygame.display.set_caption('Tetris Game')

# Project structure setup
project_folders = [
    'graphics',  # Folder for graphic assets
    'sounds',    # Folder for sound assets
    'scripts'    # Folder for Python scripts
]
for folder in project_folders:
    if not os.path.exists(folder):
        os.makedirs(folder)
        print(f"Created folder: {folder}")
main_script = 'tetris.py'
if not os.path.exists(main_script):
    with open(main_script, 'w') as file:
        file.write("# Tetris game main script\nif __name__ == '__main__':\n    print('Starting Tetris game...')\n")
    print(f"Created main script: {main_script}")

# Define block shapes and colors
block_shapes = {
    'I': [[1, 1, 1, 1]],
    'O': [[1, 1], [1, 1]],
    'T': [[0, 1, 0], [1, 1, 1]],
    'L': [[1, 0], [1, 0], [1, 1]],
    'Z': [[1, 1, 0], [0, 1, 1]]
}
block_colors = {
    'I': (0, 255, 255),
    'O': (255, 255, 0),
    'T': (128, 0, 128),
    'L': (255, 165, 0),
    'Z': (255, 0, 0)
}

# Set up the grid and boundaries
grid_width = 10
grid_height = 20
grid = [[0 for _ in range(grid_width)] for _ in range(grid_height)]
def within_boundaries(x, y):
    return 0 <= x < grid_width and 0 <= y < grid_height
print("Grid initialized with dimensions:", grid_width, "x", grid_height)
print("Is position (5, 10) within boundaries?:", within_boundaries(5, 10))
print("Is position (-1, 10) within boundaries?:", within_boundaries(-1, 10))

# Add block falling logic
# Initialize clock to manage the frame rate and block falling intervals
clock = pygame.time.Clock()
fall_time = 0  # Cumulative time
fall_speed = 500  # Time in milliseconds for blocks to fall one step

# Initialize block position (example starting point)
current_block_position = [5, 0]  # Middle-top of grid
current_block_shape = block_shapes['T']  # Example current block shape

def rotate_block(direction):
    global current_block_shape, current_block_position

    # Rotate the block
    if direction == 'clockwise':
        rotated_block = [list(row) for row in zip(*current_block_shape[::-1])]
    else:  # Counterclockwise
        rotated_block = [list(row) for row in zip(*current_block_shape)][::-1]

    # Check boundary violations or collisions (simplistic example)
    block_height = len(rotated_block)
    block_width = len(rotated_block[0])
    x, y = current_block_position

    for i in range(block_height):
        for j in range(block_width):
            if rotated_block[i][j]:
                if not within_boundaries(x + j, y + i) or grid[y + i][x + j]:
                    return  # Cancel rotation if invalid

    current_block_shape = rotated_block  # Update the current block shape if valid

# Add player input handling for block movement
def move_block(direction):
    global current_block_position
    x, y = current_block_position
    if direction == 'left' and within_boundaries(x - 1, y):
        current_block_position[0] -= 1
    elif direction == 'right' and within_boundaries(x + 1, y):
        current_block_position[0] += 1

# Game loop (to simulate block falling and movement)
run = True
while run:
    screen.fill((0, 0, 0))  # Clear the screen

    # Calculate time passed since the last frame
    delta_time = clock.tick()  # Returns the time (ms) since the last call to tick
    fall_time += delta_time

    # Check if it's time for the block to fall
    if fall_time >= fall_speed:
        fall_time = 0  # Reset fall time
        current_block_position[1] += 1  # Move block down by one step
        print("Block should fall by one step")

    # Event handling to allow quitting the game window and moving blocks
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            run = False
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_LEFT:
                move_block('left')
            elif event.key == pygame.K_RIGHT:
                move_block('right')
            elif event.key == pygame.K_UP:
                rotate_block('clockwise')
            elif event.key == pygame.K_DOWN:
                rotate_block('counterclockwise')

    pygame.display.update()

pygame.quit()