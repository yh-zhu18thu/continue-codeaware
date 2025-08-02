import pygame
import sys

# Step s-1: Initialize Pygame and create a game window
pygame.init()

# Step s-1: Set up constants for the window
WINDOW_WIDTH = 800
WINDOW_HEIGHT = 600
WINDOW_TITLE = "My Game"
BACKGROUND_IMAGE_PATH = "background.jpg"

# Step s-1: Create a game window and set its title
screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
pygame.display.set_caption(WINDOW_TITLE)

# Step s-1: Load the background image and scale it to fit the window
background = pygame.image.load(BACKGROUND_IMAGE_PATH)
background = pygame.transform.scale(background, (WINDOW_WIDTH, WINDOW_HEIGHT))

# Step s-2: Set up the clock for frame rate control
clock = pygame.time.Clock()
FPS = 60

# Step s-2: Start the main game loop
running = True
while running:
    # Step s-2: Handle events, such as quitting the game
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False

    # Step s-2: Update the display with the background image
    screen.blit(background, (0, 0))
    pygame.display.flip()

    # Step s-2: Tick the clock to maintain the frame rate
    clock.tick(FPS)

# Step s-2: Cleanly exit the game
pygame.quit()
sys.exit()