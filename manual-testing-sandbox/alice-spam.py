# Import necessary libraries
import pandas as pd  # For data handling
from sklearn.feature_extraction.text import TfidfVectorizer  # For vectorizing text

# Read the dataset from file
data = pd.read_csv('spam.csv', encoding='latin-1')  # Load dataset
print('Dataset loaded successfully.')

# Inspect the dataset format
print('First five rows of the dataset:')
print(data.head())
print('Dataset columns:', data.columns.tolist())

# Map text labels to numeric values for the target variable
# 'ham' will be mapped to 0 and 'spam' to 1
label_mapping = {'ham': 0, 'spam': 1}
data['label_num'] = data['v1'].map(label_mapping)
print('Text labels mapped to numeric values (0=ham, 1=spam).')
print('First five mapped labels:', data['label_num'].head())

# Split the data into input features (X) and target labels (y)
X = data['v2']  # Message text
y = data['label_num']  # Encoded label (0=ham, 1=spam)
print('Data split into input features X and target labels y.')
print('First five inputs:', X.head().tolist())
print('First five labels:', y.head().tolist())

# Vectorize message texts
vectorizer = TfidfVectorizer()  # Convert text to TF-IDF features
X_vectorized = vectorizer.fit_transform(X)  # Fit and transform the message texts
print('Message texts vectorized into numerical feature vectors.')
print('Shape of vectorized features:', X_vectorized.shape)
