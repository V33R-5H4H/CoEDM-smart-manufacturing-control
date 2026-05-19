'''to be implemented later'''


# from sqlalchemy.orm import Session
# from sqlalchemy.exc import IntegrityError

# from . import models
# from . import schemas


# def create_user(db: Session, user: schemas.UserCreate):
#     try:
#         with db.begin():  # Start a transaction
#             existing_user = db.query(models.User).filter(models.User.email == user.email).first()
#             if existing_user:
#                 raise ValueError(f"User with email '{user.email}' already exists.")

#             db_user = models.User(name=user.name, email=user.email)
#             db.add(db_user)
#             db.commit()
#             db.refresh(db_user)
#             return db_user
#     except IntegrityError as e:
#         db.rollback()
#         raise ValueError("Failed to create user. Integrity error occurred.") from e


# def get_user(db:Session, User_id: int):
#     return db.query(models.User).filter(models.User.id == User_id).first()


# def get_all_users(db: Session):

#     Users=db.query(models.User).all()
#     return [schemas.UserResponse.model_validate(user) for user in Users]

# def delete_user(db: Session, User_id: int):
#     user = get_user(db, User_id)
#     if user:
#         db.delete(user)
#         db.commit()
#         return schemas.UserDeleteResponse(status="success", message=f"User with id {User_id} deleted successfully.")
#     return schemas.UserDeleteResponse(status="error", message=f"User with id {User_id} not found.")




