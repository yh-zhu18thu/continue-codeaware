import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer

# Step 1: Load the dataset from 'src/spam.csv' with error handling
try:
    dataset = pd.read_csv('src/spam.csv')
    # Display basic structure of the dataset
    print(f'Dataset Shape: {dataset.shape}')  # Show number of rows and columns
    print(f'Column Names: {dataset.columns.tolist()}')  # Show column names
    print(f'Data Types:\n{dataset.dtypes}')  # Show data types of each column
except FileNotFoundError:
    print("Error: The file 'src/spam.csv' was not found. Please ensure the file exists in the correct location.")
except Exception as e:
    print(f"An unexpected error occurred: {e}")

# Step 2: Clean the dataset
# Check for missing values and abnormal entries
missing_values = dataset.isnull().sum()
abnormal_entries = (dataset.eq('').sum()) | (dataset.isin(['?', 'N/A']).sum())  # Check for values that may not be valid

# Handle missing or abnormal values (for simplicity, remove rows with such values)
if missing_values.sum() > 0 or abnormal_entries.sum() > 0:
    dataset = dataset.dropna()  # Drop rows with missing values
    dataset = dataset[~dataset.isin(['', '?', 'N/A']).any(axis=1)]  # Remove rows with abnormal entries

# Display cleaned dataset information
print(f'Dataset Shape After Cleaning: {dataset.shape}')  # Show updated number of rows and columns
print(f'Missing Values After Cleaning: {dataset.isnull().sum().sum()}')

# Step 3: Extract features from email text
try:
    if 'text' not in dataset.columns:
        raise ValueError("The column 'text' containing email content is missing.")

    # Use TfidfVectorizer to extract text-based features
    vectorizer = TfidfVectorizer()  # Initializes the TF-IDF vectorizer
    tfidf_features = vectorizer.fit_transform(dataset['text'])  # Fits and transforms the email text data

    print("Feature extraction completed successfully.")  # Acknowledge completion
    print(f"TF-IDF feature shape: {tfidf_features.shape}")  # Show shape of extracted features (sample count x feature count)
except ValueError as ve:
    print(f"ValueError: {ve}")
except Exception as e:
    print(f"An unexpected error occurred during feature extraction: {e}")