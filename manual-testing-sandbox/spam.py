import pandas as pd
from sklearn.model_selection import train_test_split

# Step 1: Load the spam dataset
spam_data_path = 'src/spam.csv'
df = pd.read_csv(spam_data_path)

# Inspect the structure and quality of the dataset
print(df.head())
print(df.info())

# Step 2: Preprocess the dataset
# Extract relevant columns for ML processing (assuming columns 'text' and 'label' exist in the dataset)
data = df[['text', 'label']]

# Optional: Clean text data (basic placeholder for cleaning implementation)
data['text'] = data['text'].str.replace(r'[^a-zA-Z0-9 ]', '', regex=True).str.lower()

# Split into training and testing sets
X_train, X_test, y_train, y_test = train_test_split(
    data['text'], data['label'], test_size=0.2, random_state=42
)